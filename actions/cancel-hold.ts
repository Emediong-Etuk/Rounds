import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { cancelHoldCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description: "Cancel a hold and tell the pharmacy they don't need to keep it aside.",
  schema: z.object({ holdId: z.string().describe("Hold id") }),
  run: async ({ holdId }, ctx) => cancelHoldCore(requireUser(ctx), holdId),
});
