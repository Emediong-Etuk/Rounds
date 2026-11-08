import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { nudgePharmacyCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description: "Send a short reminder to a pharmacy that hasn't replied. Max 2 nudges per ask, at least 5 minutes apart.",
  schema: z.object({ askId: z.string().describe("Ask id") }),
  run: async ({ askId }, ctx) => nudgePharmacyCore(requireUser(ctx), askId),
});
