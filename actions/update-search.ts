import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/rounds/auth.js";
import { loadSearch } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Update a search: mark it done or cancelled, switch watch mode on/off (re-asks out-of-stock pharmacies every 3 hours), or change whether equivalents are OK.",
  schema: z.object({
    id: z.string().describe("Search id"),
    status: z.enum(["done", "cancelled", "asking"]).optional().describe("New status"),
    watch: z.boolean().optional().describe("Watch mode on/off"),
    acceptEquivalents: z.boolean().optional().describe("Accept same ingredient + strength from another brand"),
  }),
  run: async ({ id, ...patch }, ctx) => {
    const owner = requireUser(ctx);
    await loadSearch(owner, id);
    const set: Partial<typeof schema.searches.$inferInsert> = { updatedAt: Date.now() };
    if (patch.status) set.status = patch.status;
    if (patch.watch !== undefined) set.watch = patch.watch;
    if (patch.acceptEquivalents !== undefined) set.acceptEquivalents = patch.acceptEquivalents;
    await getDb().update(schema.searches).set(set).where(and(eq(schema.searches.id, id), eq(schema.searches.ownerEmail, owner)));
    const s = await loadSearch(owner, id);
    return { id: s.id, status: s.status, watch: s.watch, acceptEquivalents: s.acceptEquivalents };
  },
});
