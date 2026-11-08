import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { installRoundsAutomations } from "../server/lib/rounds/automations.js";

export default defineAction({
  description:
    "Install the Rounds automations for the current user: the agent that reads pharmacist replies (event) and the 3-hourly watch-mode re-ask (schedule). Idempotent.",
  schema: z.object({}),
  agentTool: false,
  run: async (_args, ctx) => ({ automations: await installRoundsAutomations(requireUser(ctx)) }),
});
