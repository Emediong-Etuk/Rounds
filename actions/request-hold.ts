import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { requestHoldCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Ask a pharmacy that has the medicine to set it aside for the user. Confirm the first name and hold-until time with the user first. Only the first name is shared with the pharmacy. The board shows the pharmacy's answer.",
  schema: z.object({
    askId: z.string().describe("Ask id of a pharmacy whose latest reply is in_stock or alternative"),
    customerFirstName: z.string().min(1).max(30).describe("User's first name only"),
    quantity: z.number().int().min(1).max(20).default(1).describe("How many (default 1)"),
    holdUntil: z.string().min(4).max(40).describe('"HH:mm" 24h meaning today in Africa/Lagos (e.g. "18:00"), or an ISO date-time; future, at most 24h away'),
  }),
  run: async (args, ctx) => requestHoldCore(requireUser(ctx), args),
});
