import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { requireUser } from "../server/lib/rounds/auth.js";
import { getSearchCore } from "../server/lib/rounds/core.js";

export default defineAction({
  description:
    "Read a search's live board: every pharmacy asked, its current status (in_stock, out_of_stock, alternative, unclear, reading, asked, silent, send_failed), price, the pharmacist's raw words, holds, counts and the best option. Asks are already ranked best-first. Answer 'cheapest/closest/best' questions only from this data.",
  schema: z.object({ id: z.string().describe("Search id (srch_...)") }),
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({ view: "search", to: `/s/${encodeURIComponent(args.id)}`, params: { searchId: args.id } }),
    label: "Open the board",
  }),
  run: async ({ id }, ctx) => getSearchCore(requireUser(ctx), id),
});
