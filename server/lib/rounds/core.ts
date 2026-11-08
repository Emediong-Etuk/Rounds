// Business logic for Rounds. Plain async functions with an explicit ownerEmail.
// Actions, the Telegram webhook, the reply-link page and the virtual
// pharmacies all call these, so validation and behaviour are identical for the
// UI, the agent and pharmacists.

import { fail } from "@agent-native/core/action";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";

import { getDb, schema } from "../../db/index.js";
import { getDrugById, loadCatalog, resolveOrigin } from "./catalog.js";
import {
  OPEN_ASK_WINDOW_MS,
  SILENT_AFTER_MS,
  UNPROCESSED_FALLBACK_MS,
  VIRTUAL_SILENT_AFTER_MS,
  config,
} from "./config.js";
import { drugLabel as makeLabel, makeDrugKey, matchDrugs } from "./drugs.js";
import { newId, newReplyToken, newShortCode } from "./ids.js";
import {
  COPY,
  ackText,
  askKeyboard,
  askMessageHtml,
  askMessageText,
  esc,
  holdKeyboard,
  holdRequestHtml,
} from "./messages.js";
import { parseReply, type Availability } from "./parse-reply.js";
import {
  ago,
  formatNaira,
  haversineKm,
  lagosTime,
  rankAsks,
  roundKm,
  type DisplayStatus,
} from "./ranking.js";
import * as tg from "./telegram.js";
import { scheduleVirtualHold, scheduleVirtualNudgeReply, scheduleVirtualReply, scheduleVirtualFollowUp } from "./virtual-pharmacies.js";

export type ReplySource = "button" | "link" | "agent" | "rules" | "user_edit" | "virtual";

type Db = ReturnType<typeof getDb>;
type SearchRow = typeof schema.searches.$inferSelect;
type AskRow = typeof schema.asks.$inferSelect;
type PharmacyRow = typeof schema.pharmacies.$inferSelect;
type ReplyRow = typeof schema.replies.$inferSelect;
type MessageRow = typeof schema.messages.$inferSelect;
type HoldRow = typeof schema.holds.$inferSelect;

const parseList = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

// ── Loading with ownership ─────────────────────────────────────────────────

export async function loadSearch(ownerEmail: string, id: string): Promise<SearchRow> {
  const [row] = await getDb()
    .select()
    .from(schema.searches)
    .where(and(eq(schema.searches.id, id), eq(schema.searches.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) fail("Search not found.", { errorCode: "not_found", statusCode: 404 });
  return row;
}

export async function loadAsk(ownerEmail: string, id: string): Promise<AskRow> {
  const [row] = await getDb()
    .select()
    .from(schema.asks)
    .where(and(eq(schema.asks.id, id), eq(schema.asks.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) fail("Ask not found.", { errorCode: "not_found", statusCode: 404 });
  return row;
}

export async function loadPharmacy(id: string): Promise<PharmacyRow> {
  const [row] = await getDb().select().from(schema.pharmacies).where(eq(schema.pharmacies.id, id)).limit(1);
  if (!row) fail("Pharmacy not found.", { errorCode: "not_found", statusCode: 404 });
  return row;
}

async function latestReply(askId: string, db: Db = getDb()): Promise<ReplyRow | undefined> {
  const [r] = await db
    .select()
    .from(schema.replies)
    .where(eq(schema.replies.askId, askId))
    .orderBy(desc(schema.replies.createdAt))
    .limit(1);
  return r;
}

async function areaName(areaId: string): Promise<string> {
  const [a] = await getDb().select({ name: schema.areas.name }).from(schema.areas).where(eq(schema.areas.id, areaId)).limit(1);
  return a?.name ?? "";
}

// ── Messages log ───────────────────────────────────────────────────────────

export async function logMessage(m: {
  ownerEmail: string;
  askId: string;
  pharmacyId: string;
  direction: "in" | "out";
  channel: "telegram" | "link" | "virtual" | "system";
  text: string;
  telegramMessageId?: string | null | undefined;
  processed?: boolean | undefined;
}): Promise<MessageRow> {
  const now = Date.now();
  const row = {
    id: newId("msg"),
    ownerEmail: m.ownerEmail,
    askId: m.askId,
    pharmacyId: m.pharmacyId,
    direction: m.direction,
    channel: m.channel,
    text: m.text.slice(0, 2000),
    telegramMessageId: m.telegramMessageId ?? null,
    processed: m.processed ?? m.direction === "out",
    processedAt: (m.processed ?? m.direction === "out") ? now : null,
    createdAt: now,
  };
  await getDb().insert(schema.messages).values(row);
  return row;
}

// ── Start a search ─────────────────────────────────────────────────────────

export type StartSearchInput = {
  rawQuery: string;
  drug: {
    drugId?: string | undefined;
    label: string;
    genericName: string;
    strength?: string | undefined;
    form?: string | undefined;
    rxRequired?: boolean | undefined;
  };
  acceptEquivalents: boolean;
  origin: { area?: string | undefined; lat?: number | undefined; lng?: number | undefined };
  radiusKm?: number | undefined;
  pharmacyIds: string[];
};

export const CONTROLLED_MESSAGE =
  "Rounds can't search for controlled or abuse-prone medicines like this one. Please speak to your doctor or a pharmacist in person, who can help you safely.";

async function assertNotControlled(drug: StartSearchInput["drug"]) {
  if (drug.drugId) {
    const d = await getDrugById(drug.drugId);
    if (d?.controlled) fail(CONTROLLED_MESSAGE, { errorCode: "controlled_drug", statusCode: 422 });
  }
  // Also catch free-text labels that name a controlled drug.
  const catalog = await loadCatalog();
  const top = matchDrugs(`${drug.genericName} ${drug.label}`, catalog, 3).matches;
  if (top.some((m) => m.controlled && m.score >= 0.8)) {
    fail(CONTROLLED_MESSAGE, { errorCode: "controlled_drug", statusCode: 422 });
  }
}

export async function startSearchCore(ownerEmail: string, input: StartSearchInput) {
  await assertNotControlled(input.drug);
  const db = getDb();
  const origin = await resolveOrigin(input.origin);
  const ids = [...new Set(input.pharmacyIds)].slice(0, 15);
  if (!ids.length) fail("Pick at least one pharmacy.", { errorCode: "no_pharmacies", statusCode: 400 });

  let catalogDrug = input.drug.drugId ? await getDrugById(input.drug.drugId) : null;
  const genericName = catalogDrug?.genericName ?? input.drug.genericName;
  const strength = catalogDrug?.strength ?? input.drug.strength ?? null;
  const form = catalogDrug?.form ?? input.drug.form ?? null;
  const now = Date.now();
  const search: SearchRow = {
    id: newId("srch"),
    ownerEmail,
    rawQuery: input.rawQuery.slice(0, 300),
    drugId: catalogDrug?.id ?? null,
    drugKey: catalogDrug?.drugKey ?? makeDrugKey(genericName, strength, form),
    drugLabel: catalogDrug ? makeLabel(catalogDrug) : input.drug.label.slice(0, 120),
    genericName,
    strength,
    form,
    brandNames: JSON.stringify(catalogDrug?.brandNames ?? []),
    rxRequired: catalogDrug?.rxRequired ?? Boolean(input.drug.rxRequired),
    acceptEquivalents: input.acceptEquivalents,
    areaLabel: origin.label,
    lat: origin.lat,
    lng: origin.lng,
    radiusKm: input.radiusKm ?? 5,
    status: "asking",
    watch: false,
    lastWatchRunAt: null,
    createdAt: now,
    updatedAt: now,
  };
  catalogDrug = null;
  await db.insert(schema.searches).values(search);
  const result = await addAsks(search, ids);
  return { searchId: search.id, ...result, boardPath: `/s/${search.id}` };
}

/** Create and send asks for pharmacies not yet asked in this search. */
export async function addAsks(search: SearchRow, pharmacyIds: string[]) {
  const db = getDb();
  const existing = await db
    .select({ pharmacyId: schema.asks.pharmacyId })
    .from(schema.asks)
    .where(and(eq(schema.asks.searchId, search.id), eq(schema.asks.ownerEmail, search.ownerEmail)));
  const already = new Set(existing.map((e) => e.pharmacyId));
  const wanted = pharmacyIds.filter((id) => !already.has(id));
  const pharmacies = wanted.length
    ? await db.select().from(schema.pharmacies).where(inArray(schema.pharmacies.id, wanted))
    : [];
  const byId = new Map(pharmacies.map((p) => [p.id, p]));
  const failed: Array<{ pharmacyId: string; reason: string }> = [];
  const asks: AskRow[] = [];
  const now = Date.now();
  for (const id of wanted) {
    const p = byId.get(id);
    if (!p) {
      failed.push({ pharmacyId: id, reason: "unknown pharmacy" });
      continue;
    }
    asks.push({
      id: newId("ask"),
      ownerEmail: search.ownerEmail,
      searchId: search.id,
      pharmacyId: p.id,
      replyToken: newReplyToken(),
      shortCode: newShortCode(),
      channel: p.isVirtual ? "virtual" : p.telegramChatId ? "telegram" : "link_only",
      status: "queued",
      telegramMessageId: null,
      awaiting: null,
      awaitingPromptMessageId: null,
      sentAt: null,
      lastNudgedAt: null,
      nudgeCount: 0,
      agentMessageCount: 0,
      linkSubmissionCount: 0,
      createdAt: now,
    });
  }
  if (asks.length) await db.insert(schema.asks).values(asks);
  const results = await Promise.allSettled(asks.map((a) => sendAskCore(search, a, byId.get(a.pharmacyId)!)));
  results.forEach((r, i) => {
    const a = asks[i]!;
    if (r.status === "rejected") failed.push({ pharmacyId: a.pharmacyId, reason: String(r.reason?.message ?? r.reason) });
    else if (!r.value.ok) failed.push({ pharmacyId: a.pharmacyId, reason: r.value.reason });
  });
  if (asks.length) {
    await db.update(schema.searches).set({ status: "asking", updatedAt: Date.now() }).where(eq(schema.searches.id, search.id));
  }
  const failedAsks = failed.filter((f) => asks.some((a) => a.pharmacyId === f.pharmacyId)).length;
  return { asked: asks.length - failedAsks, failed };
}

export function searchCopy(search: SearchRow) {
  return {
    drugLabel: search.drugLabel,
    brandNames: parseList(search.brandNames),
    acceptEquivalents: search.acceptEquivalents,
    areaLabel: search.areaLabel,
  };
}

export async function sendAskCore(
  search: SearchRow,
  ask: AskRow,
  pharmacy: PharmacyRow,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = getDb();
  const now = Date.now();
  const copy = { ...searchCopy(search), askedAt: now };
  const text = askMessageText(copy);

  if (ask.channel === "virtual") {
    await db.update(schema.asks).set({ status: "sent", sentAt: now }).where(eq(schema.asks.id, ask.id));
    await logMessage({ ownerEmail: ask.ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "out", channel: "virtual", text });
    scheduleVirtualReply({ ...ask, sentAt: now }, search, pharmacy);
    return { ok: true };
  }

  if (ask.channel === "telegram" && pharmacy.telegramChatId) {
    try {
      const sent = await tg.sendMessage(pharmacy.telegramChatId, askMessageHtml(copy), askKeyboard(ask.shortCode, ask.replyToken));
      await db
        .update(schema.asks)
        .set({ status: "sent", sentAt: now, telegramMessageId: String(sent.message_id) })
        .where(eq(schema.asks.id, ask.id));
      await logMessage({
        ownerEmail: ask.ownerEmail,
        askId: ask.id,
        pharmacyId: pharmacy.id,
        direction: "out",
        channel: "telegram",
        text,
        telegramMessageId: String(sent.message_id),
      });
      return { ok: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Telegram send failed";
      await db.update(schema.asks).set({ status: "send_failed" }).where(eq(schema.asks.id, ask.id));
      await logMessage({ ownerEmail: ask.ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "out", channel: "system", text: `Could not send: ${reason}` });
      return { ok: false, reason };
    }
  }

  await db.update(schema.asks).set({ status: "send_failed" }).where(eq(schema.asks.id, ask.id));
  return { ok: false, reason: "Pharmacy is not connected to Rounds yet" };
}

// ── Recording replies (the central path) ───────────────────────────────────

export type RecordReplyInput = {
  askId: string;
  availability: Availability;
  priceNaira?: number | null | undefined;
  quantity?: number | null | undefined;
  alternativeText?: string | null | undefined;
  restockEta?: string | null | undefined;
  rawText?: string | null | undefined;
  source: ReplySource;
  sourceMessageId?: string | null | undefined;
  confidence?: number | null | undefined;
  notifyPharmacy?: boolean | undefined;
};

export async function recordReplyCore(ownerEmail: string, input: RecordReplyInput) {
  const db = getDb();
  const ask = await loadAsk(ownerEmail, input.askId);

  if (input.sourceMessageId) {
    const [dupe] = await db
      .select()
      .from(schema.replies)
      .where(eq(schema.replies.sourceMessageId, input.sourceMessageId))
      .limit(1);
    if (dupe) return { replyId: dupe.id, duplicate: true, availability: dupe.availability };
  }

  const previous = await latestReply(ask.id);
  const now = Date.now();
  const reply: ReplyRow = {
    id: newId("rep"),
    ownerEmail,
    askId: ask.id,
    pharmacyId: ask.pharmacyId,
    availability: input.availability,
    priceNaira: input.priceNaira ?? null,
    quantity: input.quantity ?? null,
    alternativeText: input.alternativeText?.slice(0, 200) ?? null,
    restockEta: input.restockEta?.slice(0, 60) ?? null,
    rawText: input.rawText?.slice(0, 1000) ?? null,
    source: input.source,
    sourceMessageId: input.sourceMessageId ?? null,
    confidence: input.confidence ?? null,
    createdAt: now,
  };
  try {
    await db.insert(schema.replies).values(reply);
  } catch (err) {
    // A concurrent writer recorded the same source message first.
    if (input.sourceMessageId) {
      const [dupe] = await db.select().from(schema.replies).where(eq(schema.replies.sourceMessageId, input.sourceMessageId)).limit(1);
      if (dupe) return { replyId: dupe.id, duplicate: true, availability: dupe.availability };
    }
    throw err;
  }

  // Settle the inbound message(s) this reply read.
  const isMessageId = input.sourceMessageId?.startsWith("msg_");
  await db
    .update(schema.messages)
    .set({ processed: true, processedAt: now })
    .where(
      isMessageId
        ? and(eq(schema.messages.id, input.sourceMessageId!), eq(schema.messages.ownerEmail, ownerEmail))
        : and(
            eq(schema.messages.askId, ask.id),
            eq(schema.messages.ownerEmail, ownerEmail),
            eq(schema.messages.direction, "in"),
            eq(schema.messages.processed, false),
          ),
    );

  await db
    .update(schema.asks)
    .set({ status: "answered", ...(input.availability !== "unclear" ? { awaiting: null } : {}) })
    .where(eq(schema.asks.id, ask.id));

  const changed =
    !previous || previous.availability !== reply.availability || previous.priceNaira !== reply.priceNaira;
  if (reply.availability !== "unclear" && (input.source !== "user_edit" || changed)) {
    const [search] = await db
      .select({ drugKey: schema.searches.drugKey, drugLabel: schema.searches.drugLabel })
      .from(schema.searches)
      .where(eq(schema.searches.id, ask.searchId))
      .limit(1);
    if (search) {
      await db.insert(schema.stockObservations).values({
        id: newId("obs"),
        pharmacyId: ask.pharmacyId,
        drugKey: search.drugKey,
        drugLabel: search.drugLabel,
        availability: reply.availability,
        priceNaira: reply.priceNaira,
        observedAt: now,
        source: input.source,
      });
    }
  }

  if (input.notifyPharmacy && reply.availability !== "unclear") {
    await notifyPharmacy(ask, ackText(reply)).catch(() => undefined);
  }
  await maybeFinishSearch(ownerEmail, ask.searchId);
  return { replyId: reply.id, duplicate: false, availability: reply.availability };
}

/** Send a short text to the pharmacy on its channel, and log it. */
async function notifyPharmacy(ask: AskRow, text: string, html?: string, replyMarkup?: tg.ReplyMarkup) {
  const pharmacy = await loadPharmacy(ask.pharmacyId);
  if (ask.channel === "telegram" && pharmacy.telegramChatId) {
    const sent = await tg.sendMessage(pharmacy.telegramChatId, html ?? esc(text), replyMarkup);
    await logMessage({ ownerEmail: ask.ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "out", channel: "telegram", text, telegramMessageId: String(sent.message_id) });
    return sent;
  }
  if (ask.channel === "virtual") {
    await logMessage({ ownerEmail: ask.ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "out", channel: "virtual", text });
  }
  return null;
}

async function maybeFinishSearch(ownerEmail: string, searchId: string) {
  const db = getDb();
  const asks = await db
    .select({ status: schema.asks.status })
    .from(schema.asks)
    .where(and(eq(schema.asks.searchId, searchId), eq(schema.asks.ownerEmail, ownerEmail)));
  const open = asks.some((a) => a.status === "sent" || a.status === "queued" || a.status === "reply_received");
  await db
    .update(schema.searches)
    .set({ updatedAt: Date.now(), ...(open ? {} : { status: "done" }) })
    .where(and(eq(schema.searches.id, searchId), eq(schema.searches.ownerEmail, ownerEmail), eq(schema.searches.status, "asking")));
}

/** Telegram follow-up: add a price (or restock date) to the latest reply. */
export async function amendLatestReply(
  ownerEmail: string,
  askId: string,
  patch: { priceNaira?: number | undefined; restockEta?: string | undefined; rawText: string; sourceMessageId: string },
) {
  const prev = await latestReply(askId);
  if (!prev) return null;
  return recordReplyCore(ownerEmail, {
    askId,
    availability: prev.availability as Availability,
    priceNaira: patch.priceNaira ?? prev.priceNaira,
    quantity: prev.quantity,
    alternativeText: prev.alternativeText,
    restockEta: patch.restockEta ?? prev.restockEta,
    rawText: `${prev.rawText ? `${prev.rawText} · ` : ""}${patch.rawText}`,
    source: prev.source === "button" ? "button" : (prev.source as ReplySource),
    sourceMessageId: patch.sourceMessageId,
    confidence: prev.confidence,
    notifyPharmacy: true,
  });
}

// ── Rules fallback ─────────────────────────────────────────────────────────

/** Read an inbound message with the deterministic parser and record it. */
export async function recordWithRules(ownerEmail: string, message: MessageRow, sourceOverride?: ReplySource) {
  const [search] = await getDb()
    .select({ strength: schema.searches.strength, form: schema.searches.form })
    .from(schema.searches)
    .innerJoin(schema.asks, eq(schema.asks.searchId, schema.searches.id))
    .where(and(eq(schema.asks.id, message.askId), eq(schema.asks.ownerEmail, ownerEmail)))
    .limit(1);
  const parsed = parseReply(message.text, { strength: search?.strength, form: search?.form });
  return recordReplyCore(ownerEmail, {
    askId: message.askId,
    availability: parsed.availability,
    priceNaira: parsed.priceNaira,
    quantity: parsed.quantity,
    restockEta: parsed.restockEta,
    alternativeText: parsed.alternativeText,
    rawText: message.text,
    source: sourceOverride ?? "rules",
    sourceMessageId: message.id,
    confidence: parsed.confidence,
    notifyPharmacy: true,
  });
}

/** Any inbound message nobody has read after 60s is read by the rules parser. */
export async function runLazyFallback(ownerEmail: string, askIds: string[]) {
  if (!askIds.length) return 0;
  const stale = await getDb()
    .select()
    .from(schema.messages)
    .where(
      and(
        eq(schema.messages.ownerEmail, ownerEmail),
        inArray(schema.messages.askId, askIds),
        eq(schema.messages.direction, "in"),
        eq(schema.messages.processed, false),
        lt(schema.messages.createdAt, Date.now() - UNPROCESSED_FALLBACK_MS),
      ),
    )
    .orderBy(asc(schema.messages.createdAt))
    .limit(20);
  for (const m of stale) {
    await recordWithRules(ownerEmail, m).catch((err) => console.error("[rounds] fallback failed", err));
  }
  return stale.length;
}

// ── Board view ─────────────────────────────────────────────────────────────

export type BoardAsk = {
  id: string;
  pharmacy: {
    id: string;
    name: string;
    areaName: string;
    address: string;
    phone: string | null;
    lat: number;
    lng: number;
    distanceKm: number;
    isVirtual: boolean;
  };
  channel: string;
  status: string;
  displayStatus: DisplayStatus;
  sentAt: number | null;
  sentAgo: string | null;
  latestReply: ReturnType<typeof replyView> | null;
  replyHistory: ReturnType<typeof replyView>[];
  lastInboundText: string | null;
  lastInboundAt: number | null;
  hold: ReturnType<typeof holdView> | null;
  canNudge: boolean;
  canHold: boolean;
  nudgeCount: number;
  replyLinkToken?: string;
};

function replyView(r: ReplyRow) {
  return {
    id: r.id,
    availability: r.availability as Availability,
    priceNaira: r.priceNaira,
    priceLabel: r.priceNaira ? formatNaira(r.priceNaira) : null,
    quantity: r.quantity,
    alternativeText: r.alternativeText,
    restockEta: r.restockEta,
    rawText: r.rawText,
    source: r.source as ReplySource,
    confidence: r.confidence,
    createdAt: r.createdAt,
  };
}

function holdView(h: HoldRow) {
  return {
    id: h.id,
    status: h.status,
    customerFirstName: h.customerFirstName,
    quantity: h.quantity,
    holdUntil: h.holdUntil,
    holdUntilLabel: lagosTime(h.holdUntil),
  };
}

export async function getSearchCore(ownerEmail: string, id: string, opts: { fallback?: boolean } = {}) {
  const db = getDb();
  const search = await loadSearch(ownerEmail, id);
  let asks = await db
    .select()
    .from(schema.asks)
    .where(and(eq(schema.asks.searchId, id), eq(schema.asks.ownerEmail, ownerEmail)))
    .orderBy(asc(schema.asks.createdAt))
    .limit(60);
  const askIds = asks.map((a) => a.id);

  if (opts.fallback !== false && (await runLazyFallback(ownerEmail, askIds)) > 0) {
    asks = await db
      .select()
      .from(schema.asks)
      .where(and(eq(schema.asks.searchId, id), eq(schema.asks.ownerEmail, ownerEmail)))
      .orderBy(asc(schema.asks.createdAt))
      .limit(60);
  }

  const [pharmacies, replies, messages, holds, areas] = await Promise.all([
    asks.length ? db.select().from(schema.pharmacies).where(inArray(schema.pharmacies.id, asks.map((a) => a.pharmacyId))) : [],
    askIds.length
      ? db.select().from(schema.replies).where(and(eq(schema.replies.ownerEmail, ownerEmail), inArray(schema.replies.askId, askIds))).orderBy(asc(schema.replies.createdAt)).limit(500)
      : [],
    askIds.length
      ? db.select().from(schema.messages).where(and(eq(schema.messages.ownerEmail, ownerEmail), inArray(schema.messages.askId, askIds))).orderBy(asc(schema.messages.createdAt)).limit(800)
      : [],
    askIds.length
      ? db.select().from(schema.holds).where(and(eq(schema.holds.ownerEmail, ownerEmail), inArray(schema.holds.askId, askIds))).orderBy(asc(schema.holds.createdAt)).limit(100)
      : [],
    db.select().from(schema.areas).limit(200),
  ]);
  const areaById = new Map(areas.map((a) => [a.id, a.name]));
  const phById = new Map(pharmacies.map((p) => [p.id, p]));
  const now = Date.now();

  const boardAsks: BoardAsk[] = asks.map((a) => {
    const p = phById.get(a.pharmacyId)!;
    const rs = replies.filter((r) => r.askId === a.id);
    const ms = messages.filter((m) => m.askId === a.id);
    const inbound = ms.filter((m) => m.direction === "in");
    const lastIn = inbound[inbound.length - 1];
    const hs = holds.filter((h) => h.askId === a.id && h.status !== "cancelled");
    const hold = hs[hs.length - 1];
    const latest = rs[rs.length - 1];
    const unread = inbound.some((m) => !m.processed);
    const silentAfter = a.channel === "virtual" && config.demoMode ? VIRTUAL_SILENT_AFTER_MS : SILENT_AFTER_MS;
    let displayStatus: DisplayStatus;
    if (a.status === "send_failed") displayStatus = "send_failed";
    else if (a.status === "cancelled") displayStatus = "cancelled";
    else if (a.status === "queued") displayStatus = "queued";
    else if (unread) displayStatus = "reading";
    else if (latest) displayStatus = latest.availability as DisplayStatus;
    else if (!inbound.length && a.sentAt && now - a.sentAt > silentAfter) displayStatus = "silent";
    else displayStatus = "asked";
    const unanswered = !latest && (displayStatus === "asked" || displayStatus === "silent");
    const canNudge =
      unanswered &&
      displayStatus === "silent" &&
      a.nudgeCount < 2 &&
      (!a.lastNudgedAt || now - a.lastNudgedAt >= 5 * 60 * 1000) &&
      a.channel !== "link_only";
    return {
      id: a.id,
      pharmacy: {
        id: p.id,
        name: p.name,
        areaName: areaById.get(p.areaId) ?? "",
        address: p.address,
        phone: p.phone,
        lat: p.lat,
        lng: p.lng,
        distanceKm: roundKm(haversineKm(search, p)),
        isVirtual: p.isVirtual,
      },
      channel: a.channel,
      status: a.status,
      displayStatus,
      sentAt: a.sentAt,
      sentAgo: a.sentAt ? ago(a.sentAt, now) : null,
      latestReply: latest ? replyView(latest) : null,
      replyHistory: rs.map(replyView),
      lastInboundText: lastIn?.text ?? null,
      lastInboundAt: lastIn?.createdAt ?? null,
      hold: hold ? holdView(hold) : null,
      canNudge,
      canHold: Boolean(latest && (latest.availability === "in_stock" || latest.availability === "alternative")) && (!hold || hold.status === "declined" || hold.status === "expired"),
      nudgeCount: a.nudgeCount,
      ...(config.demoMode ? { replyLinkToken: a.replyToken } : {}),
    };
  });

  const ranked = rankAsks(
    boardAsks.map((a) => ({
      ...a,
      priceNaira: a.latestReply?.priceNaira ?? null,
      distanceKm: a.pharmacy.distanceKm,
      held: a.hold?.status === "confirmed",
    })),
  );

  const counts = {
    asked: boardAsks.filter((a) => a.status !== "send_failed" && a.status !== "queued").length,
    replied: boardAsks.filter((a) => a.latestReply || a.displayStatus === "reading").length,
    inStock: boardAsks.filter((a) => a.displayStatus === "in_stock").length,
    out: boardAsks.filter((a) => a.displayStatus === "out_of_stock").length,
    alternative: boardAsks.filter((a) => a.displayStatus === "alternative").length,
    silent: boardAsks.filter((a) => a.displayStatus === "silent").length,
    unclear: boardAsks.filter((a) => a.displayStatus === "unclear").length,
    reading: boardAsks.filter((a) => a.displayStatus === "reading").length,
    pending: boardAsks.filter((a) => a.displayStatus === "asked" || a.displayStatus === "reading" || a.displayStatus === "queued").length,
    failed: boardAsks.filter((a) => a.displayStatus === "send_failed").length,
  };
  const best = ranked.find((a) => a.displayStatus === "in_stock");
  const summaryLine = `Asked ${counts.asked} · Replied ${counts.replied} · In stock ${counts.inStock}`;

  // Activity timeline
  const nameOf = (askId: string) => phById.get(asks.find((a) => a.id === askId)?.pharmacyId ?? "")?.name ?? "Pharmacy";
  const timeline: Array<{ at: number; text: string; kind: string }> = [];
  const sentTimes = asks.map((a) => a.sentAt).filter((t): t is number => Boolean(t));
  if (sentTimes.length) timeline.push({ at: Math.min(...sentTimes), kind: "sent", text: `Sent to ${sentTimes.length} pharmacies` });
  for (const m of messages) {
    if (m.direction === "in") timeline.push({ at: m.createdAt, kind: "in", text: `${nameOf(m.askId)}: “${m.text.slice(0, 80)}”` });
    else if (m.channel !== "system" && !m.text.startsWith("Rounds stock check")) timeline.push({ at: m.createdAt, kind: "out", text: `To ${nameOf(m.askId)}: “${m.text.slice(0, 80)}”` });
  }
  for (const r of replies) {
    const label =
      r.availability === "in_stock" ? `In stock${r.priceNaira ? ` ${formatNaira(r.priceNaira)}` : ""}`
      : r.availability === "out_of_stock" ? `Out${r.restockEta ? ` (back ${r.restockEta})` : ""}`
      : r.availability === "alternative" ? "Has alternative"
      : "Unclear";
    const who = r.source === "agent" ? "Read by Rounds AI" : r.source === "user_edit" ? "Edited by you" : r.source === "button" ? "Tapped by pharmacist" : r.source === "link" ? "Reply link" : "Read by rules";
    timeline.push({ at: r.createdAt, kind: "reply", text: `${nameOf(r.askId)} → ${label} · ${who}` });
  }
  for (const h of holds) timeline.push({ at: h.updatedAt, kind: "hold", text: `${nameOf(h.askId)}: hold for ${h.customerFirstName} ${h.status}` });
  timeline.sort((a, b) => a.at - b.at);

  return {
    search: {
      id: search.id,
      rawQuery: search.rawQuery,
      drugId: search.drugId,
      drugKey: search.drugKey,
      drugLabel: search.drugLabel,
      genericName: search.genericName,
      strength: search.strength,
      form: search.form,
      brandNames: parseList(search.brandNames),
      rxRequired: search.rxRequired,
      acceptEquivalents: search.acceptEquivalents,
      areaLabel: search.areaLabel,
      lat: search.lat,
      lng: search.lng,
      radiusKm: search.radiusKm,
      status: search.status,
      watch: search.watch,
      lastWatchRunAt: search.lastWatchRunAt,
      createdAt: search.createdAt,
      createdLabel: lagosTime(search.createdAt),
    },
    asks: ranked.map(({ priceNaira: _p, distanceKm: _d, held: _h, ...a }) => a as BoardAsk),
    counts,
    bestAskId: best?.id ?? null,
    summaryLine,
    timeline: timeline.map((t) => ({ ...t, time: lagosTime(t.at) })),
    demoMode: config.demoMode,
  };
}

// ── Agent-facing ask detail ────────────────────────────────────────────────

export async function getAskCore(ownerEmail: string, id: string) {
  const db = getDb();
  const ask = await loadAsk(ownerEmail, id);
  const [search, pharmacy, thread, latest] = await Promise.all([
    loadSearch(ownerEmail, ask.searchId),
    loadPharmacy(ask.pharmacyId),
    db.select().from(schema.messages).where(and(eq(schema.messages.askId, ask.id), eq(schema.messages.ownerEmail, ownerEmail))).orderBy(asc(schema.messages.createdAt)).limit(50),
    latestReply(ask.id),
  ]);
  return {
    ask: {
      id: ask.id,
      status: ask.status,
      channel: ask.channel,
      awaiting: ask.awaiting,
      sentAt: ask.sentAt,
      agentMessageCount: ask.agentMessageCount,
    },
    pharmacy: { id: pharmacy.id, name: pharmacy.name, areaName: await areaName(pharmacy.areaId), isVirtual: pharmacy.isVirtual },
    request: {
      searchId: search.id,
      drugLabel: search.drugLabel,
      genericName: search.genericName,
      strength: search.strength,
      form: search.form,
      brandNames: parseList(search.brandNames),
      acceptEquivalents: search.acceptEquivalents,
      areaLabel: search.areaLabel,
    },
    thread: thread.map((m) => ({
      messageId: m.id,
      direction: m.direction,
      channel: m.channel,
      text: m.text,
      processed: m.processed,
      at: m.createdAt,
      time: lagosTime(m.createdAt),
    })),
    latestReply: latest ? replyView(latest) : null,
  };
}

// ── Messaging pharmacists (agent clarifications, nudges) ───────────────────

export async function messagePharmacyCore(ownerEmail: string, askId: string, text: string) {
  const db = getDb();
  const ask = await loadAsk(ownerEmail, askId);
  if (ask.channel !== "telegram" && ask.channel !== "virtual") {
    fail("This pharmacy can't be messaged.", { errorCode: "not_reachable", statusCode: 409 });
  }
  if (!ask.sentAt || Date.now() - ask.sentAt > OPEN_ASK_WINDOW_MS) {
    fail("This request is more than 24 hours old.", { errorCode: "ask_expired", statusCode: 409 });
  }
  if (ask.agentMessageCount >= 2) {
    fail("Already sent 2 messages for this request. Don't message this pharmacy again; tell the user instead.", {
      errorCode: "message_limit",
      statusCode: 429,
    });
  }
  await db.update(schema.asks).set({ agentMessageCount: ask.agentMessageCount + 1 }).where(eq(schema.asks.id, ask.id));
  await notifyPharmacy(ask, text);
  if (ask.channel === "virtual") {
    const [search, pharmacy] = await Promise.all([loadSearch(ownerEmail, ask.searchId), loadPharmacy(ask.pharmacyId)]);
    scheduleVirtualFollowUp(ask, search, pharmacy);
  }
  return { askId: ask.id, sent: true, remaining: 1 - ask.agentMessageCount };
}

export async function nudgePharmacyCore(ownerEmail: string, askId: string) {
  const db = getDb();
  const ask = await loadAsk(ownerEmail, askId);
  const latest = await latestReply(ask.id);
  if (latest) fail("This pharmacy already replied.", { errorCode: "already_answered", statusCode: 409 });
  if (ask.nudgeCount >= 2) fail("Already nudged twice.", { errorCode: "nudge_limit", statusCode: 429 });
  if (ask.lastNudgedAt && Date.now() - ask.lastNudgedAt < 5 * 60 * 1000) {
    fail("Nudged less than 5 minutes ago. Give them a moment.", { errorCode: "nudge_too_soon", statusCode: 429 });
  }
  if (ask.channel === "link_only" || ask.status === "send_failed") {
    fail("This pharmacy can't be messaged.", { errorCode: "not_reachable", statusCode: 409 });
  }
  const search = await loadSearch(ownerEmail, ask.searchId);
  const now = Date.now();
  await db.update(schema.asks).set({ nudgeCount: ask.nudgeCount + 1, lastNudgedAt: now }).where(eq(schema.asks.id, ask.id));
  const text = `Quick reminder: do you have ${search.drugLabel}? Tap a button above or just reply. Thank you!`;
  const pharmacy = await loadPharmacy(ask.pharmacyId);
  if (ask.channel === "telegram" && pharmacy.telegramChatId) {
    const sent = await tg.sendMessage(pharmacy.telegramChatId, COPY.nudge(search.drugLabel), undefined, ask.telegramMessageId);
    await logMessage({ ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "out", channel: "telegram", text, telegramMessageId: String(sent.message_id) });
  } else {
    await logMessage({ ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "out", channel: "virtual", text });
    scheduleVirtualNudgeReply(ask, search, pharmacy);
  }
  return { askId: ask.id, nudgeCount: ask.nudgeCount + 1 };
}

// ── Holds ──────────────────────────────────────────────────────────────────

/** "18:00" means today (Africa/Lagos, UTC+1, no DST); ISO strings are taken as-is. */
export function parseHoldUntil(value: string, now = Date.now()): number {
  const hm = value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (hm) {
    let h = Number(hm[1]);
    const m = Number(hm[2]);
    const ap = hm[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || m > 59) fail("Invalid time.", { errorCode: "invalid_time", statusCode: 400 });
    const lagosNow = new Date(now + 60 * 60 * 1000); // shift to UTC+1 wall clock
    const target = Date.UTC(lagosNow.getUTCFullYear(), lagosNow.getUTCMonth(), lagosNow.getUTCDate(), h, m) - 60 * 60 * 1000;
    return target;
  }
  const t = Date.parse(value);
  if (Number.isNaN(t)) fail('holdUntil must be "HH:mm" (today, Lagos time) or an ISO date-time.', { errorCode: "invalid_time", statusCode: 400 });
  return t;
}

export async function requestHoldCore(
  ownerEmail: string,
  input: { askId: string; customerFirstName: string; quantity?: number | undefined; holdUntil: string },
) {
  const db = getDb();
  const ask = await loadAsk(ownerEmail, input.askId);
  const latest = await latestReply(ask.id);
  if (!latest || (latest.availability !== "in_stock" && latest.availability !== "alternative")) {
    fail("You can only hold at a pharmacy that said it has it.", { errorCode: "not_in_stock", statusCode: 409 });
  }
  const now = Date.now();
  const holdUntil = parseHoldUntil(input.holdUntil, now);
  if (holdUntil <= now + 5 * 60 * 1000) fail("Pick a hold-until time in the future.", { errorCode: "invalid_time", statusCode: 400 });
  if (holdUntil > now + 24 * 60 * 60 * 1000) fail("Holds can be at most 24 hours.", { errorCode: "invalid_time", statusCode: 400 });
  const active = await db
    .select({ id: schema.holds.id })
    .from(schema.holds)
    .where(and(eq(schema.holds.askId, ask.id), eq(schema.holds.ownerEmail, ownerEmail), inArray(schema.holds.status, ["requested", "confirmed"])))
    .limit(1);
  if (active.length) fail("There's already a hold for this pharmacy.", { errorCode: "hold_exists", statusCode: 409 });

  const search = await loadSearch(ownerEmail, ask.searchId);
  const pharmacy = await loadPharmacy(ask.pharmacyId);
  const firstName = input.customerFirstName.trim().split(/\s+/)[0]!.slice(0, 30);
  const hold: HoldRow = {
    id: newId("hold"),
    ownerEmail,
    askId: ask.id,
    pharmacyId: ask.pharmacyId,
    customerFirstName: firstName,
    quantity: input.quantity ?? 1,
    holdUntil,
    status: "requested",
    shortCode: newShortCode(),
    telegramMessageId: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.holds).values(hold);
  const label = latest.availability === "alternative" && latest.alternativeText ? latest.alternativeText : search.drugLabel;
  const text = `Hold request: ${hold.quantity} × ${label} for ${firstName}, until ${lagosTime(holdUntil)} today.`;
  if (ask.channel === "telegram" && pharmacy.telegramChatId) {
    try {
      const sent = await tg.sendMessage(
        pharmacy.telegramChatId,
        holdRequestHtml({ quantity: hold.quantity, drugLabel: label, firstName, holdUntil }),
        holdKeyboard(hold.shortCode),
      );
      await db.update(schema.holds).set({ telegramMessageId: String(sent.message_id) }).where(eq(schema.holds.id, hold.id));
      await logMessage({ ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "out", channel: "telegram", text, telegramMessageId: String(sent.message_id) });
    } catch (err) {
      await db.update(schema.holds).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(schema.holds.id, hold.id));
      fail(`Couldn't reach the pharmacy: ${err instanceof Error ? err.message : "send failed"}`, { errorCode: "send_failed", statusCode: 502 });
    }
  } else {
    await logMessage({ ownerEmail, askId: ask.id, pharmacyId: pharmacy.id, direction: "out", channel: "virtual", text });
    scheduleVirtualHold(hold);
  }
  return { holdId: hold.id, status: hold.status, holdUntil, holdUntilLabel: lagosTime(holdUntil), pharmacyName: pharmacy.name };
}

export async function setHoldStatusCore(ownerEmail: string, holdId: string, status: "confirmed" | "declined") {
  const db = getDb();
  const [hold] = await db.select().from(schema.holds).where(and(eq(schema.holds.id, holdId), eq(schema.holds.ownerEmail, ownerEmail))).limit(1);
  if (!hold) return null;
  if (hold.status !== "requested") return hold;
  await db.update(schema.holds).set({ status, updatedAt: Date.now() }).where(eq(schema.holds.id, hold.id));
  await logMessage({
    ownerEmail,
    askId: hold.askId,
    pharmacyId: hold.pharmacyId,
    direction: "in",
    channel: "system",
    text: status === "confirmed" ? `Hold confirmed for ${hold.customerFirstName}` : `Hold declined`,
    processed: true,
  });
  return { ...hold, status };
}

export async function cancelHoldCore(ownerEmail: string, holdId: string) {
  const db = getDb();
  const [hold] = await db.select().from(schema.holds).where(and(eq(schema.holds.id, holdId), eq(schema.holds.ownerEmail, ownerEmail))).limit(1);
  if (!hold) fail("Hold not found.", { errorCode: "not_found", statusCode: 404 });
  if (hold.status === "cancelled") return { holdId, status: "cancelled" };
  await db.update(schema.holds).set({ status: "cancelled", updatedAt: Date.now() }).where(eq(schema.holds.id, hold.id));
  const ask = await loadAsk(ownerEmail, hold.askId);
  const search = await loadSearch(ownerEmail, ask.searchId);
  if (hold.status === "requested" || hold.status === "confirmed") {
    await notifyPharmacy(ask, `Hold cancelled: ${search.drugLabel} for ${hold.customerFirstName}. You don't need to keep it aside. Thank you!`, COPY.holdCancelled(search.drugLabel, hold.customerFirstName)).catch(() => undefined);
  }
  return { holdId, status: "cancelled" };
}
