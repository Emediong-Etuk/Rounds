import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/rounds/auth.js";
import { getSearchCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description: "List the user's recent searches, newest first, with counts (asked, replied, in stock).",
  schema: z.object({ limit: z.coerce.number().int().min(1).max(20).default(8).describe("How many (default 8)") }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ limit }, ctx) => {
    const owner = requireUser(ctx);
    const rows = await getDb()
      .select({ id: schema.searches.id })
      .from(schema.searches)
      .where(eq(schema.searches.ownerEmail, owner))
      .orderBy(desc(schema.searches.createdAt))
      .limit(limit);
    const boards = await Promise.all(rows.map((r) => getSearchCore(owner, r.id, { fallback: false })));
    return {
      searches: boards.map((b) => ({
        id: b.search.id,
        drugLabel: b.search.drugLabel,
        areaLabel: b.search.areaLabel,
        status: b.search.status,
        watch: b.search.watch,
        createdAt: b.search.createdAt,
        createdLabel: b.search.createdLabel,
        counts: b.counts,
        summaryLine: b.summaryLine,
        best: b.asks.find((a) => a.id === b.bestAskId)
          ? {
              pharmacyName: b.asks.find((a) => a.id === b.bestAskId)!.pharmacy.name,
              priceNaira: b.asks.find((a) => a.id === b.bestAskId)!.latestReply?.priceNaira ?? null,
            }
          : null,
      })),
    };
  },
});
