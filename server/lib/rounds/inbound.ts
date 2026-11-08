import { emit } from "@agent-native/core/event-bus";

import { config } from "./config.js";
import { logMessage, recordWithRules } from "./core.js";
import { PHARMACY_MESSAGE_EVENT, registerRoundsEvents, type PharmacyMessagePayload } from "./events.js";

/**
 * Every pharmacist message enters here: Telegram free text, demo pharmacies
 * and the simulate-pharmacy-reply dev tool. It is stored unprocessed, then
 * either read by the agent (event automation) or by the rules parser.
 */
export async function ingestInboundMessage(input: {
  ownerEmail: string;
  askId: string;
  candidateAskIds?: string[] | undefined;
  pharmacyId: string;
  pharmacyName: string;
  text: string;
  channel: "telegram" | "virtual" | "link";
  telegramMessageId?: string | null | undefined;
}) {
  const message = await logMessage({
    ownerEmail: input.ownerEmail,
    askId: input.askId,
    pharmacyId: input.pharmacyId,
    direction: "in",
    channel: input.channel,
    text: input.text,
    telegramMessageId: input.telegramMessageId,
    processed: false,
  });

  if (config.replyParser === "rules") {
    await recordWithRules(input.ownerEmail, message);
    return { messageId: message.id, readBy: "rules" as const };
  }

  registerRoundsEvents();
  const payload: PharmacyMessagePayload = {
    messageId: message.id,
    askId: input.candidateAskIds && input.candidateAskIds.length > 1 ? null : input.askId,
    candidateAskIds: input.candidateAskIds ?? [],
    pharmacyId: input.pharmacyId,
    pharmacyName: input.pharmacyName,
    text: input.text,
  };
  emit(PHARMACY_MESSAGE_EVENT, payload, { owner: input.ownerEmail });
  return { messageId: message.id, readBy: "agent" as const };
}
