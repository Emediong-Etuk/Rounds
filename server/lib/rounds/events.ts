import { registerEvent } from "@agent-native/core/event-bus";
import { z } from "zod";

export const PHARMACY_MESSAGE_EVENT = "pharmacy.message.received";

export const pharmacyMessagePayload = z.object({
  messageId: z.string().describe("messages.id of the inbound message; pass as sourceMessageId to record-reply"),
  askId: z.string().nullable().describe("The ask this message answers, when known"),
  candidateAskIds: z.array(z.string()).describe("Open asks it may answer, when askId is null"),
  pharmacyId: z.string(),
  pharmacyName: z.string(),
  text: z.string().describe("The pharmacist's message, verbatim"),
});

export type PharmacyMessagePayload = z.infer<typeof pharmacyMessagePayload>;

let registered = false;
export function registerRoundsEvents() {
  if (registered) return;
  registered = true;
  registerEvent({
    name: PHARMACY_MESSAGE_EVENT,
    description:
      "A pharmacist replied (on Telegram or as a demo pharmacy) to a Rounds stock request. Read it with get-ask and record it with record-reply.",
    payloadSchema: pharmacyMessagePayload,
    example: {
      messageId: "msg_abc123",
      askId: "ask_abc123",
      candidateAskIds: [],
      pharmacyId: "ph_greenleaf",
      pharmacyName: "Greenleaf Pharmacy",
      text: "we get am, 3.5k",
    },
  });
}
