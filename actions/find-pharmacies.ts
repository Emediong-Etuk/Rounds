import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { findPharmaciesCore, resolveOrigin } from "../server/lib/rounds/catalog.js";

export default defineAction({
  description:
    "Find pharmacies near an area name or coordinates, nearest reachable first, boosted when they recently had the drug in stock (lastKnown). Reachable = connected on Telegram or a Demo pharmacy. Pass drugKey from resolve-drug to get stock memory. Fails with unknown_area (details.suggestions) when the area is not recognised.",
  schema: z.object({
    area: z.string().max(80).optional().describe('Neighbourhood name, e.g. "Rumuola" or "Ewet Housing"'),
    lat: z.coerce.number().min(-90).max(90).optional().describe("Latitude (decimal degrees), when the user shared their location"),
    lng: z.coerce.number().min(-180).max(180).optional().describe("Longitude (decimal degrees)"),
    radiusKm: z.coerce.number().min(0.5).max(25).default(5).describe("Search radius in km (default 5, max 25)"),
    drugKey: z.string().max(120).optional().describe("drugKey from resolve-drug, for stock memory"),
    limit: z.coerce.number().int().min(1).max(30).default(12).describe("Max pharmacies to return (default 12)"),
    reachableOnly: z
      .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
      .default(true)
      .describe("Only pharmacies Rounds can message right now (default true)"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args) => {
    const origin = await resolveOrigin(args);
    const pharmacies = await findPharmaciesCore({
      origin,
      radiusKm: args.radiusKm,
      drugKey: args.drugKey,
      limit: args.limit,
      reachableOnly: args.reachableOnly,
    });
    return { origin, radiusKm: args.radiusKm, pharmacies };
  },
});
