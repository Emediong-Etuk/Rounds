import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { loadCatalog } from "../server/lib/rounds/catalog.js";
import { matchDrugs } from "../server/lib/rounds/drugs.js";

export default defineAction({
  description:
    "Match what the user typed or said (brand, generic name, nickname, optional strength like 500mg) to the medicine catalog. Returns up to 5 matches, best first, with rxRequired and controlled flags. Always call before find-pharmacies/start-search and confirm the generic name, strength and form with the user. Empty matches means not in the catalog: you may propose a label and mark it unverified.",
  schema: z.object({
    query: z.string().min(1).max(200).describe('What the user asked for, e.g. "ventolin inhaler" or "amoxil 500mg"'),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ query }) => {
    const catalog = await loadCatalog();
    const { matches, parsedStrength } = matchDrugs(query, catalog, 5);
    return {
      matches: matches.map((m) => ({
        id: m.id,
        genericName: m.genericName,
        strength: m.strength,
        form: m.form,
        brandNames: m.brandNames,
        rxRequired: m.rxRequired,
        controlled: m.controlled,
        drugKey: m.drugKey,
        label: m.label,
        score: m.score,
      })),
      ...(parsedStrength ? { parsedStrength } : {}),
    };
  },
});
