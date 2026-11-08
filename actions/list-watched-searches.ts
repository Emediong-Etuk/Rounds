import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { listWatchedSearchesCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description: "List the user's searches in watch mode, with whether any pharmacy now has it in stock. Used by the rounds-watch automation.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_a, ctx) => ({ searches: await listWatchedSearchesCore(requireUser(ctx)) }),
});
