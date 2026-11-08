import { defineAction } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { ensureRoundsAutomations } from "../server/lib/rounds/automations.js";
import { config } from "../server/lib/rounds/config.js";
import { startSearchCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Ask pharmacies (all at once) whether they have a medicine. Call only after the user confirmed the drug (from resolve-drug) and you proposed pharmacies (from find-pharmacies). Sends on Telegram, or schedules a reply for Demo pharmacies, and opens the live board. Refuses controlled drugs with errorCode controlled_drug: explain kindly, don't retry.",
  schema: z.object({
    rawQuery: z.string().min(1).max(300).describe("What the user originally asked for"),
    drug: z
      .object({
        drugId: z.string().optional().describe("Catalog id from resolve-drug (preferred)"),
        label: z.string().min(1).max(120).describe('Display label, e.g. "Salbutamol 100mcg inhaler"'),
        genericName: z.string().min(1).max(80).describe("Active ingredient"),
        strength: z.string().max(40).optional().describe('e.g. "100mcg"'),
        form: z.string().max(40).optional().describe("inhaler | tablet | capsule | syrup | injection | sachet"),
        rxRequired: z.boolean().optional().describe("Prescription needed (for unverified custom labels)"),
      })
      .describe("The confirmed medicine"),
    acceptEquivalents: z.boolean().default(true).describe("User accepts same ingredient + strength + form from another brand"),
    origin: z
      .object({
        area: z.string().max(80).optional().describe("Area name, e.g. Rumuola"),
        lat: z.number().optional().describe("Latitude"),
        lng: z.number().optional().describe("Longitude"),
      })
      .describe("Where the user is"),
    radiusKm: z.number().min(0.5).max(25).optional().describe("Radius used to pick the pharmacies (km)"),
    pharmacyIds: z.array(z.string()).min(1).max(15).describe("Pharmacy ids from find-pharmacies (1-15)"),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({ view: "search", to: `/s/${encodeURIComponent(result.searchId)}`, params: { searchId: result.searchId } }),
    label: "Open the live board",
  }),
  run: async (args, ctx) => {
    const owner = requireUser(ctx);
    // The reply-reading automation must exist before the first reply arrives.
    if (config.replyParser === "agent") {
      await ensureRoundsAutomations(owner).catch((err) => console.error("[rounds] automation install failed", err));
    }
    const result = await startSearchCore(owner, args);
    if (ctx?.caller === "tool") {
      await writeAppStateForCurrentTab("navigate", {
        view: "search",
        path: result.boardPath,
        searchId: result.searchId,
        _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      }).catch(() => undefined);
    }
    return result;
  },
});
