import { timingSafeEqual } from "node:crypto";

import { defineEventHandler, getRequestHeader, readRawBody } from "h3";

import { config } from "../../../lib/rounds/config.js";
import { claimUpdate, handleUpdate, type TgUpdate } from "../../../lib/rounds/telegram-webhook.js";

function secretMatches(given: string | undefined): boolean {
  const expected = config.telegramWebhookSecret;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });

// Telegram retries anything that isn't 2xx, so after the secret check this
// always answers 200 and logs failures instead.
export default defineEventHandler(async (event) => {
  if (!secretMatches(getRequestHeader(event, "x-telegram-bot-api-secret-token"))) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { "content-type": "application/json" } });
  }
  let update: TgUpdate;
  try {
    const raw = (await readRawBody(event)) ?? "";
    if (raw.length > 256_000) return ok();
    update = JSON.parse(raw) as TgUpdate;
  } catch {
    return ok();
  }
  if (typeof update?.update_id !== "number") return ok();
  try {
    if (!(await claimUpdate(update.update_id))) return ok(); // duplicate delivery
    await handleUpdate(update);
  } catch (err) {
    console.error("[rounds/telegram] update failed", err instanceof Error ? err.message : err);
  }
  return ok();
});
