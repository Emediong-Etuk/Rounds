import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/rounds/auth.js";
import { newId, newShortCode } from "../server/lib/rounds/ids.js";
import { offsetPoint } from "../server/lib/rounds/ranking.js";

export default defineAction({
  description:
    "Add a pharmacy to the directory, or edit one (pass id). New pharmacies get a connect code so they can link Telegram. Use fictional/demo data only unless the pharmacy agreed to join.",
  schema: z.object({
    id: z.string().optional().describe("Existing pharmacy id to edit; omit to add"),
    name: z.string().min(2).max(80).describe("Pharmacy name"),
    areaId: z.string().describe("Area id from list-areas"),
    address: z.string().max(160).optional().describe("Street address"),
    phone: z.string().max(30).optional().describe("Phone number"),
    lat: z.number().optional().describe("Latitude; defaults near the area centre"),
    lng: z.number().optional().describe("Longitude"),
  }),
  run: async (args, ctx) => {
    requireUser(ctx);
    const db = getDb();
    const [area] = await db.select().from(schema.areas).where(eq(schema.areas.id, args.areaId)).limit(1);
    if (!area) fail("Unknown area.", { errorCode: "unknown_area", statusCode: 400 });
    const point =
      args.lat !== undefined && args.lng !== undefined
        ? { lat: args.lat, lng: args.lng }
        : offsetPoint(area, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2);
    const fields = {
      name: args.name,
      areaId: area.id,
      city: area.city,
      address: args.address ?? `${area.name}, ${area.city}`,
      phone: args.phone ?? null,
      lat: point.lat,
      lng: point.lng,
    };
    if (args.id) {
      const updated = await db.update(schema.pharmacies).set(fields).where(eq(schema.pharmacies.id, args.id)).returning({ id: schema.pharmacies.id });
      if (!updated.length) fail("Pharmacy not found.", { errorCode: "not_found", statusCode: 404 });
      return { id: args.id, created: false };
    }
    const id = newId("ph");
    await db.insert(schema.pharmacies).values({
      id,
      ...fields,
      connectCode: newShortCode().toUpperCase(),
      isVirtual: false,
      createdAt: Date.now(),
    });
    return { id, created: true };
  },
});
