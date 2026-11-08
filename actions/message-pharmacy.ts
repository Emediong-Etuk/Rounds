import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { messagePharmacyCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Send ONE short, polite message to a pharmacist about an open request: a clarifying question when their reply was unclear (e.g. 'Thank you! Is that the 100mcg inhaler?'), or a brief answer to their question. Max 2 per ask, within 24h. Never include the user's name, phone, email or exact location.",
  schema: z.object({
    askId: z.string().describe("Ask id"),
    text: z.string().min(1).max(300).describe("Message text, simple English (light Pidgin only if they wrote in Pidgin)"),
  }),
  run: async ({ askId, text }, ctx) => messagePharmacyCore(requireUser(ctx), askId, text),
});
