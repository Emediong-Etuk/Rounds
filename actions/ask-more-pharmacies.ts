import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { addAsks, loadSearch } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Ask more pharmacies in an existing search (e.g. after widening the radius with find-pharmacies). Skips pharmacies already asked.",
  schema: z.object({
    searchId: z.string().describe("Search id"),
    pharmacyIds: z.array(z.string()).min(1).max(15).describe("Pharmacy ids from find-pharmacies"),
  }),
  run: async ({ searchId, pharmacyIds }, ctx) => {
    const owner = requireUser(ctx);
    const search = await loadSearch(owner, searchId);
    return addAsks(search, pharmacyIds);
  },
});
