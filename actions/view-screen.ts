import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import { getSearchCore } from "../server/lib/rounds/core.js";

type Nav = { view?: string; path?: string; searchId?: string } | null;
type Selection = { askId?: string; searchId?: string; pharmacyName?: string; label?: string } | null;

export default defineAction({
  description:
    "Read what the user sees right now: navigation (view, searchId), the card they selected on the board (selection: askId, pharmacyName) and, on a board, a fresh snapshot (drug, counts, best option, top asks with status/price/distance and the pharmacist's words). Use for 'which is cheapest', 'summarise', 'hold this one'.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async (_args, ctx) => {
    const navigation = (await readAppState("navigation")) as Nav;
    const selection = (await readAppState("selection")) as Selection;
    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;
    if (selection) screen.selection = selection;

    const searchId = navigation?.searchId ?? (navigation?.path?.match(/^\/s\/([^/?#]+)/)?.[1] || undefined);
    if (searchId && ctx?.userEmail) {
      try {
        const b = await getSearchCore(ctx.userEmail, searchId);
        const brief = (a: (typeof b.asks)[number]) => ({
          askId: a.id,
          pharmacy: a.pharmacy.name,
          area: a.pharmacy.areaName,
          distanceKm: a.pharmacy.distanceKm,
          status: a.displayStatus,
          priceNaira: a.latestReply?.priceNaira ?? null,
          quantity: a.latestReply?.quantity ?? null,
          alternative: a.latestReply?.alternativeText ?? null,
          restockEta: a.latestReply?.restockEta ?? null,
          pharmacistSaid: a.lastInboundText,
          readBy: a.latestReply?.source ?? null,
          hold: a.hold ? `${a.hold.status} for ${a.hold.customerFirstName} until ${a.hold.holdUntilLabel}` : null,
          canHold: a.canHold,
          isDemo: a.pharmacy.isVirtual,
        });
        screen.board = {
          searchId: b.search.id,
          drug: b.search.drugLabel,
          rxRequired: b.search.rxRequired,
          acceptEquivalents: b.search.acceptEquivalents,
          area: b.search.areaLabel,
          watch: b.search.watch,
          summary: b.summaryLine,
          counts: b.counts,
          best: b.bestAskId ? brief(b.asks.find((a) => a.id === b.bestAskId)!) : null,
          rankedAsks: b.asks.slice(0, 8).map(brief),
          ...(b.asks.length > 8 ? { moreAsks: b.asks.length - 8 } : {}),
        };
        const selected = selection?.askId ? b.asks.find((a) => a.id === selection.askId) : undefined;
        if (selected) screen.selectedAsk = { ...brief(selected), replyHistory: selected.replyHistory };
      } catch {
        screen.board = { error: "Search not found for this user" };
      }
    }
    if (Object.keys(screen).length === 0) return "No application state found. Is the app running?";
    return screen;
  },
});
