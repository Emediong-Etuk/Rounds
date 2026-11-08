import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/rounds/auth.js";

export default defineAction({
  description: "List the pharmacy directory with connection status (connected on Telegram, demo, or not yet connected).",
  schema: z.object({ city: z.enum(["Port Harcourt", "Uyo"]).optional().describe("Filter by city") }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ city }, ctx) => {
    requireUser(ctx);
    const db = getDb();
    const [rows, areas] = await Promise.all([
      db.select().from(schema.pharmacies).orderBy(schema.pharmacies.city, schema.pharmacies.name).limit(500),
      db.select().from(schema.areas).limit(200),
    ]);
    const areaName = new Map(areas.map((a) => [a.id, a.name]));
    return {
      pharmacies: rows
        .filter((p) => !city || p.city === city)
        .map((p) => ({
          id: p.id,
          name: p.name,
          areaId: p.areaId,
          areaName: areaName.get(p.areaId) ?? "",
          city: p.city,
          address: p.address,
          phone: p.phone,
          isVirtual: p.isVirtual,
          virtualPersona: p.virtualPersona,
          connected: Boolean(p.telegramChatId),
          telegramUsername: p.telegramUsername,
          connectedAt: p.connectedAt,
        })),
    };
  },
});
