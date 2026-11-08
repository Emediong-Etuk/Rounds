import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/rounds/auth.js";
import { config } from "../server/lib/rounds/config.js";
import { seedReferenceData } from "../server/lib/rounds/seed.js";

export default defineAction({
  description:
    "Demo reset: delete the current user's searches (and their asks, messages, replies, holds). Pharmacy Telegram connections are kept. Optionally clear learned stock memory (demo mode only) and re-seed.",
  schema: z.object({
    clearStockMemory: z.boolean().default(false).describe("Also delete stock observations except the seeded ones (DEMO_MODE only)"),
  }),
  agentTool: false,
  run: async ({ clearStockMemory }, ctx) => {
    const owner = requireUser(ctx);
    const db = getDb();
    const searches = await db.select({ id: schema.searches.id }).from(schema.searches).where(eq(schema.searches.ownerEmail, owner)).limit(5000);
    const ids = searches.map((s) => s.id);
    if (ids.length) {
      const asks = await db
        .select({ id: schema.asks.id })
        .from(schema.asks)
        .where(and(eq(schema.asks.ownerEmail, owner), inArray(schema.asks.searchId, ids)));
      const askIds = asks.map((a) => a.id);
      if (askIds.length) {
        await db.delete(schema.holds).where(and(eq(schema.holds.ownerEmail, owner), inArray(schema.holds.askId, askIds)));
        await db.delete(schema.replies).where(and(eq(schema.replies.ownerEmail, owner), inArray(schema.replies.askId, askIds)));
        await db.delete(schema.messages).where(and(eq(schema.messages.ownerEmail, owner), inArray(schema.messages.askId, askIds)));
        await db.delete(schema.asks).where(and(eq(schema.asks.ownerEmail, owner), inArray(schema.asks.id, askIds)));
      }
      await db.delete(schema.searches).where(and(eq(schema.searches.ownerEmail, owner), inArray(schema.searches.id, ids)));
    }
    if (clearStockMemory) {
      if (!config.demoMode) fail("Stock memory can only be cleared in demo mode.", { errorCode: "demo_only", statusCode: 403 });
      await db.delete(schema.stockObservations).where(ne(schema.stockObservations.source, "seed"));
    }
    await seedReferenceData();
    return { deletedSearches: ids.length, clearedStockMemory: clearStockMemory };
  },
});
