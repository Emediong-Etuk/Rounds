import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { seedReferenceData } from "../server/lib/rounds/seed.js";

export default defineAction({
  description:
    "Seed or refresh the demo reference data (areas, medicine catalog, fictional pharmacies). Idempotent; keeps Telegram connections.",
  schema: z.object({}),
  agentTool: false,
  run: async () => seedReferenceData(),
});
