import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { config } from "../server/lib/rounds/config.js";
import { loadAsk, loadPharmacy } from "../server/lib/rounds/core.js";
import { ingestInboundMessage } from "../server/lib/rounds/inbound.js";

export default defineAction({
  description: "Demo/rehearsal only: inject a pharmacist message for an ask, exactly as if it arrived on Telegram.",
  schema: z.object({
    askId: z.string().describe("Ask id"),
    text: z.string().min(1).max(500).describe("What the pharmacist says"),
  }),
  agentTool: false,
  run: async ({ askId, text }, ctx) => {
    if (!config.demoMode) fail("Only available in demo mode.", { errorCode: "demo_only", statusCode: 403 });
    const owner = requireUser(ctx);
    const ask = await loadAsk(owner, askId);
    const pharmacy = await loadPharmacy(ask.pharmacyId);
    return ingestInboundMessage({
      ownerEmail: owner,
      askId: ask.id,
      pharmacyId: pharmacy.id,
      pharmacyName: pharmacy.name,
      text,
      channel: ask.channel === "telegram" ? "telegram" : "virtual",
    });
  },
});
