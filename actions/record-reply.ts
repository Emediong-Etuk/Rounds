import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { recordReplyCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Record what a pharmacy said about stock: the one action behind the agent reading a message, the user correcting a card, and pharmacist buttons/reply links. Use after reading a pharmacist's message. Never invent prices or availability the message doesn't state. Use unclear when you can't tell. Pass the messageId as sourceMessageId so a message is never recorded twice.",
  schema: z.object({
    askId: z.string().describe("Ask id (ask_...)"),
    availability: z.enum(["in_stock", "out_of_stock", "alternative", "unclear"]).describe("What the pharmacy said"),
    priceNaira: z.number().int().min(50).max(2_000_000).optional().describe("Price in whole naira, only if stated"),
    quantity: z.number().int().min(1).max(1000).optional().describe("Units in stock, only if stated"),
    alternativeText: z.string().max(200).optional().describe('What they offer instead, e.g. "Asthalin 100mcg inhaler"'),
    restockEta: z.string().max(60).optional().describe('When it is expected back, e.g. "Thursday"'),
    rawText: z.string().max(1000).optional().describe("The pharmacist's words this is based on"),
    source: z.enum(["agent", "user_edit", "button", "link", "rules", "virtual"]).default("agent").describe('Who read it: "agent" when you read a message'),
    sourceMessageId: z.string().max(80).optional().describe("messageId from the event payload / get-ask thread"),
    confidence: z.number().min(0).max(1).optional().describe("How sure you are (0-1)"),
    notifyPharmacy: z.boolean().default(false).describe("Send the pharmacist a one-line thank-you acknowledgement"),
  }),
  run: async (args, ctx) => {
    const owner = requireUser(ctx);
    // Corrections from the board are always user edits.
    const source = ctx?.caller === "frontend" ? "user_edit" : args.source;
    return recordReplyCore(owner, { ...args, source, ...(source === "user_edit" ? { notifyPharmacy: false } : {}) });
  },
});
