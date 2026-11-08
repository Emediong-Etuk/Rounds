import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { reAskOutOfStockCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Watch mode: ask again the pharmacies in a search that said out of stock or stayed silent, if they were last asked more than 3 hours ago.",
  schema: z.object({
    searchId: z.string().describe("Search id"),
    force: z.boolean().default(false).describe("Re-ask now even if asked less than 3 hours ago (only when the user asks)"),
  }),
  run: async ({ searchId, force }, ctx) => reAskOutOfStockCore(requireUser(ctx), searchId, force),
});
