// Telegram webhook logic. The route verifies the secret and dedupes; this
// file handles one update. Every write goes through the same core functions
// the UI and agent use.

import { runWithRequestContext } from "@agent-native/core/server";
import { and, desc, eq, gte, inArray, ne, or } from "drizzle-orm";

import { getDb, schema } from "../../db/index.js";
import { OPEN_ASK_WINDOW_MS } from "./config.js";
import { amendLatestReply, logMessage, recordReplyCore, searchCopy, setHoldStatusCore } from "./core.js";
import { ingestInboundMessage } from "./inbound.js";
import { COPY, askMessageHtml, esc } from "./messages.js";
import { parsePrice, parseRestock } from "./parse-reply.js";
import { lagosTime } from "./ranking.js";
import * as tg from "./telegram.js";

type TgUser = { id: number; username?: string; first_name?: string };
type TgChat = { id: number; type?: string };
type TgMessage = {
  message_id: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  reply_to_message?: { message_id: number };
};
type TgCallback = { id: string; from: TgUser; data?: string; message?: TgMessage };
export type TgUpdate = { update_id: number; message?: TgMessage; callback_query?: TgCallback };

type Ask = typeof schema.asks.$inferSelect;
type Pharmacy = typeof schema.pharmacies.$inferSelect;

const safe = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    console.warn("[rounds/telegram]", err instanceof Error ? err.message : err);
  }
};

const asOwner = <T>(ownerEmail: string, fn: () => Promise<T>) =>
  runWithRequestContext({ userEmail: ownerEmail }, fn) as Promise<T>;

/** Returns false when the update was already processed. */
export async function claimUpdate(updateId: number): Promise<boolean> {
  const rows = await getDb()
    .insert(schema.telegramUpdates)
    .values({ updateId, receivedAt: Date.now() })
    .onConflictDoNothing()
    .returning({ updateId: schema.telegramUpdates.updateId });
  return rows.length > 0;
}

export async function handleUpdate(update: TgUpdate) {
  if (update.callback_query) return handleCallback(update.callback_query);
  const msg = update.message;
  if (!msg || msg.chat.type && msg.chat.type !== "private") return;
  const chatId = String(msg.chat.id);
  const text = msg.text?.trim();

  if (text?.startsWith("/start")) return handleStart(chatId, msg, text);

  const pharmacy = await pharmacyByChat(chatId);
  if (!pharmacy) {
    await safe(tg.sendMessage(chatId, COPY.unknownChat));
    return;
  }
  if (!text) {
    await safe(tg.sendMessage(chatId, COPY.textOnly));
    return;
  }
  await handleText(pharmacy, chatId, msg, text);
}

async function pharmacyByChat(chatId: string): Promise<Pharmacy | undefined> {
  const [p] = await getDb().select().from(schema.pharmacies).where(eq(schema.pharmacies.telegramChatId, chatId)).limit(1);
  return p;
}

async function areaName(areaId: string) {
  const [a] = await getDb().select({ name: schema.areas.name }).from(schema.areas).where(eq(schema.areas.id, areaId)).limit(1);
  return a?.name ?? "";
}

async function handleStart(chatId: string, msg: TgMessage, text: string) {
  const code = text.split(/\s+/)[1]?.trim();
  if (!code) {
    const existing = await pharmacyByChat(chatId);
    await safe(
      tg.sendMessage(chatId, existing ? COPY.connected(existing.name, await areaName(existing.areaId)) : COPY.unknownChat),
    );
    return;
  }
  const db = getDb();
  const [pharmacy] = await db
    .select()
    .from(schema.pharmacies)
    .where(or(eq(schema.pharmacies.connectCode, code), eq(schema.pharmacies.connectCode, code.toUpperCase())))
    .limit(1);
  if (!pharmacy || pharmacy.isVirtual) {
    await safe(tg.sendMessage(chatId, COPY.badConnectCode));
    return;
  }
  // One Telegram chat represents one pharmacy.
  await db
    .update(schema.pharmacies)
    .set({ telegramChatId: null, telegramUsername: null, connectedAt: null })
    .where(and(eq(schema.pharmacies.telegramChatId, chatId), ne(schema.pharmacies.id, pharmacy.id)));
  await db
    .update(schema.pharmacies)
    .set({ telegramChatId: chatId, telegramUsername: msg.from?.username ?? null, connectedAt: Date.now() })
    .where(eq(schema.pharmacies.id, pharmacy.id));
  await safe(tg.sendMessage(chatId, COPY.connected(pharmacy.name, await areaName(pharmacy.areaId))));
}

/** Open asks for this pharmacy, newest first. */
async function openAsks(pharmacyId: string): Promise<Ask[]> {
  const rows = await getDb()
    .select({ ask: schema.asks, searchStatus: schema.searches.status })
    .from(schema.asks)
    .innerJoin(schema.searches, eq(schema.searches.id, schema.asks.searchId))
    .where(
      and(
        eq(schema.asks.pharmacyId, pharmacyId),
        eq(schema.asks.channel, "telegram"),
        gte(schema.asks.sentAt, Date.now() - OPEN_ASK_WINDOW_MS),
        inArray(schema.asks.status, ["sent", "answered", "reply_received"]),
      ),
    )
    .orderBy(desc(schema.asks.sentAt))
    .limit(10);
  return rows.filter((r) => r.searchStatus !== "cancelled").map((r) => r.ask);
}

async function handleText(pharmacy: Pharmacy, chatId: string, msg: TgMessage, text: string) {
  const asks = await openAsks(pharmacy.id);
  const replyTo = msg.reply_to_message?.message_id ? String(msg.reply_to_message.message_id) : null;
  let target: Ask | undefined;
  let candidates: Ask[] = [];
  if (replyTo) {
    target = asks.find((a) => a.telegramMessageId === replyTo || a.awaitingPromptMessageId === replyTo);
  }
  if (!target) {
    const unanswered = asks.filter((a) => a.status === "sent");
    const awaiting = asks.filter((a) => a.awaiting);
    if (awaiting.length === 1) target = awaiting[0];
    else if (unanswered.length === 1) target = unanswered[0];
    else if (unanswered.length > 1) {
      target = unanswered[0];
      candidates = unanswered;
    } else target = asks[0];
  }
  if (!target) {
    await safe(tg.sendMessage(chatId, COPY.noOpenAsk));
    return;
  }
  const ask = target;
  const sourceMessageId = `tg:${chatId}:${msg.message_id}`;

  // Fast paths for button follow-ups (no LLM needed).
  if (ask.awaiting === "price") {
    const skip = /^\s*(skip|no|nope|later)\s*$/i.test(text);
    const price = parsePrice(text);
    if (skip || (price !== undefined && text.replace(/[\d\s,.₦]|naira|ngn|k\b|n\b/gi, "").length <= 3)) {
      await asOwner(ask.ownerEmail, async () => {
        await logMessage({ ownerEmail: ask.ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "in", channel: "telegram", text, telegramMessageId: String(msg.message_id), processed: true });
        await clearAwaiting(ask.id);
        if (price !== undefined && !skip) {
          await amendLatestReply(ask.ownerEmail, ask.id, { priceNaira: price, rawText: text, sourceMessageId });
        } else {
          await safe(tg.sendMessage(chatId, "👍 Thank you!"));
        }
      });
      return;
    }
  }
  if (ask.awaiting === "restock" && text.length <= 40) {
    await asOwner(ask.ownerEmail, async () => {
      await logMessage({ ownerEmail: ask.ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "in", channel: "telegram", text, telegramMessageId: String(msg.message_id), processed: true });
      await clearAwaiting(ask.id);
      await amendLatestReply(ask.ownerEmail, ask.id, { restockEta: parseRestock(text) ?? text.slice(0, 60), rawText: text, sourceMessageId });
    });
    return;
  }
  if (ask.awaiting === "alternative") {
    await asOwner(ask.ownerEmail, async () => {
      await logMessage({ ownerEmail: ask.ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "in", channel: "telegram", text, telegramMessageId: String(msg.message_id), processed: true });
      await clearAwaiting(ask.id);
      const price = parsePrice(text);
      await recordReplyCore(ask.ownerEmail, {
        askId: ask.id,
        availability: "alternative",
        priceNaira: price,
        alternativeText: text.slice(0, 200),
        rawText: text,
        source: "button",
        sourceMessageId,
        confidence: 0.9,
        notifyPharmacy: true,
      });
    });
    return;
  }

  await safe(tg.sendChatAction(chatId, "typing"));
  await asOwner(ask.ownerEmail, () =>
    ingestInboundMessage({
      ownerEmail: ask.ownerEmail,
      askId: ask.id,
      candidateAskIds: candidates.length > 1 ? candidates.map((c) => c.id) : undefined,
      pharmacyId: pharmacy.id,
      pharmacyName: pharmacy.name,
      text,
      channel: "telegram",
      telegramMessageId: String(msg.message_id),
    }),
  );
}

async function clearAwaiting(askId: string) {
  await getDb().update(schema.asks).set({ awaiting: null, awaitingPromptMessageId: null }).where(eq(schema.asks.id, askId));
}

async function handleCallback(cb: TgCallback) {
  const data = cb.data ?? "";
  const chatId = cb.message ? String(cb.message.chat.id) : String(cb.from.id);
  const [kind, code, choice] = data.split(":");
  try {
    if (kind === "a" && code && choice) await handleAskButton(cb, chatId, code, choice);
    else if (kind === "h" && code && choice) await handleHoldButton(cb, chatId, code, choice);
    else await safe(tg.answerCallbackQuery(cb.id));
  } catch (err) {
    console.error("[rounds/telegram] callback failed", err);
    await safe(tg.answerCallbackQuery(cb.id, "Sorry, something went wrong"));
  }
}

async function handleAskButton(cb: TgCallback, chatId: string, code: string, choice: string) {
  const db = getDb();
  const [ask] = await db.select().from(schema.asks).where(eq(schema.asks.shortCode, code)).limit(1);
  const pharmacy = ask ? (await db.select().from(schema.pharmacies).where(eq(schema.pharmacies.id, ask.pharmacyId)).limit(1))[0] : undefined;
  if (!ask || !pharmacy || pharmacy.telegramChatId !== chatId) {
    await safe(tg.answerCallbackQuery(cb.id, "This request isn't for this chat"));
    return;
  }
  const [search] = await db
    .select()
    .from(schema.searches)
    .where(and(eq(schema.searches.id, ask.searchId), eq(schema.searches.ownerEmail, ask.ownerEmail)))
    .limit(1);
  if (!search || search.status === "cancelled") {
    await safe(tg.answerCallbackQuery(cb.id, "The customer cancelled this request. Thank you!"));
    return;
  }
  const map = {
    y: { availability: "in_stock", said: "✅ You said: in stock", prompt: COPY.askPrice, awaiting: "price", toast: "Thanks! Price?" },
    n: { availability: "out_of_stock", said: "❌ You said: out of stock", prompt: COPY.askRestock, awaiting: "restock", toast: "Thanks!" },
    alt: { availability: "alternative", said: "🔁 You said: alternative", prompt: COPY.askAlternative, awaiting: "alternative", toast: "Thanks! What do you have?" },
  } as const;
  const c = map[choice as keyof typeof map];
  if (!c) {
    await safe(tg.answerCallbackQuery(cb.id));
    return;
  }
  await safe(tg.answerCallbackQuery(cb.id, c.toast));
  await asOwner(ask.ownerEmail, async () => {
    await logMessage({ ownerEmail: ask.ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "in", channel: "telegram", text: `[button] ${c.said.replace(/^\S+\s/, "")}`, processed: true });
    await recordReplyCore(ask.ownerEmail, {
      askId: ask.id,
      availability: c.availability,
      rawText: c.said.replace(/^\S+\s/, ""),
      source: "button",
      sourceMessageId: `cb:${cb.id}`,
      confidence: 1,
    });
  });
  if (cb.message) {
    const html = `${askMessageHtml({ ...searchCopy(search), askedAt: ask.sentAt ?? ask.createdAt })}\n\n<b>${esc(c.said)}</b>`;
    await safe(tg.editMessageText(chatId, String(cb.message.message_id), html));
  }
  try {
    const prompt = await tg.sendMessage(chatId, c.prompt, { force_reply: true, input_field_placeholder: c.awaiting === "price" ? "3500" : "" , selective: true });
    await db
      .update(schema.asks)
      .set({ awaiting: c.awaiting, awaitingPromptMessageId: String(prompt.message_id) })
      .where(eq(schema.asks.id, ask.id));
  } catch (err) {
    console.warn("[rounds/telegram] prompt failed", err instanceof Error ? err.message : err);
  }
}

async function handleHoldButton(cb: TgCallback, chatId: string, code: string, choice: string) {
  const db = getDb();
  const [hold] = await db.select().from(schema.holds).where(eq(schema.holds.shortCode, code)).limit(1);
  const pharmacy = hold ? (await db.select().from(schema.pharmacies).where(eq(schema.pharmacies.id, hold.pharmacyId)).limit(1))[0] : undefined;
  if (!hold || !pharmacy || pharmacy.telegramChatId !== chatId) {
    await safe(tg.answerCallbackQuery(cb.id, "This request isn't for this chat"));
    return;
  }
  if (hold.status !== "requested") {
    await safe(tg.answerCallbackQuery(cb.id, hold.status === "cancelled" ? "The customer cancelled this hold" : "Already answered. Thank you!"));
    if (cb.message) await safe(tg.editMessageReplyMarkup(chatId, String(cb.message.message_id)));
    return;
  }
  const ok = choice === "ok";
  await asOwner(hold.ownerEmail, () => setHoldStatusCore(hold.ownerEmail, hold.id, ok ? "confirmed" : "declined"));
  await safe(tg.answerCallbackQuery(cb.id, ok ? "Thank you! 🙏" : "No problem"));
  if (cb.message) {
    const line = ok
      ? `✅ Holding for <b>${esc(hold.customerFirstName)}</b> until <b>${esc(lagosTime(hold.holdUntil))}</b>. Thank you!`
      : "❌ You said you can't hold it. Thanks for letting us know.";
    await safe(tg.editMessageText(chatId, String(cb.message.message_id), `📌 <b>Hold request</b>\n${line}`));
  }
}
