import { config } from "./config.js";

// Tiny typed client over the Telegram Bot API. Never logs the token.

export type InlineButton = { text: string; callback_data?: string; url?: string };
export type ReplyMarkup =
  | { inline_keyboard: InlineButton[][] }
  | { force_reply: true; input_field_placeholder?: string; selective?: boolean };

export class TelegramError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export function telegramConfigured(): boolean {
  return Boolean(config.telegramBotToken);
}

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = config.telegramBotToken;
  if (!token) throw new TelegramError("Telegram bot is not configured", "not_configured");
  const url = `${config.telegramApiBase}/bot${token}/${method}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: T;
        description?: string;
        parameters?: { retry_after?: number };
      };
      if (json.ok) return json.result as T;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt === 0) {
        const wait = Math.min(5, json.parameters?.retry_after ?? 1) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new TelegramError(json.description ?? `Telegram ${method} failed (${res.status})`, `http_${res.status}`);
    } catch (err) {
      if (err instanceof TelegramError) throw err;
      if (attempt === 0) continue;
      throw new TelegramError(`Telegram ${method} request failed`, "network");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new TelegramError(`Telegram ${method} failed`, "unknown");
}

export type SentMessage = { message_id: number; chat: { id: number } };

export function sendMessage(
  chatId: string,
  html: string,
  replyMarkup?: ReplyMarkup,
  replyToMessageId?: string | null,
): Promise<SentMessage> {
  return call<SentMessage>("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    ...(replyToMessageId
      ? { reply_parameters: { message_id: Number(replyToMessageId), allow_sending_without_reply: true } }
      : {}),
  });
}

export function answerCallbackQuery(id: string, text?: string): Promise<boolean> {
  return call<boolean>("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
}

export function editMessageText(
  chatId: string,
  messageId: string,
  html: string,
  replyMarkup?: { inline_keyboard: InlineButton[][] },
): Promise<unknown> {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: Number(messageId),
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

export function editMessageReplyMarkup(
  chatId: string,
  messageId: string,
  replyMarkup: { inline_keyboard: InlineButton[][] } = { inline_keyboard: [] },
): Promise<unknown> {
  return call("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: Number(messageId),
    reply_markup: replyMarkup,
  });
}

export function sendChatAction(chatId: string, action = "typing"): Promise<boolean> {
  return call<boolean>("sendChatAction", { chat_id: chatId, action });
}

export function setWebhook(body: Record<string, unknown>) {
  return call("setWebhook", body);
}

export function getWebhookInfo() {
  return call("getWebhookInfo", {});
}
