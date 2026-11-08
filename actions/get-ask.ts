import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { getAskCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Read one ask (one pharmacy in one search): what we asked (drug, strength, form, brands, equivalents OK?), the full message thread with the pharmacist, the latest recorded reply and what we're awaiting. Call before reading a pharmacist's reply.",
  schema: z.object({ id: z.string().describe("Ask id (ask_...)") }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }, ctx) => getAskCore(requireUser(ctx), id),
});
