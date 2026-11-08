// Demo pharmacies. They reply after realistic delays with realistic text, and
// their replies go through the same inbound pipeline (and the same agent
// reading) as real Telegram messages. In-process timers are fine because we
// deploy on a long-running Node server.

import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../../db/index.js";
import { setHoldStatusCore } from "./core.js";
import { ingestInboundMessage } from "./inbound.js";
import { SEED_DRUGS, type VirtualPersona } from "./seed-data.js";

type Ask = typeof schema.asks.$inferSelect;
type Search = typeof schema.searches.$inferSelect;
type Pharmacy = typeof schema.pharmacies.$inferSelect;
type Hold = typeof schema.holds.$inferSelect;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;

function priceFor(search: Search): number {
  const d = SEED_DRUGS.find((x) => x.id === search.drugId);
  const [lo, hi] = d && d.priceRange[1] > 0 ? d.priceRange : [1000, 5000];
  return Math.max(100, Math.round(rand(lo, hi) / 100) * 100);
}

const kFormat = (n: number) => (n % 1000 === 0 ? `${n / 1000}k` : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`);
const commas = (n: number) => n.toLocaleString("en-NG");

function brands(search: Search): string[] {
  try {
    const v = JSON.parse(search.brandNames);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

function shortName(search: Search): string {
  return brands(search)[0] ?? search.genericName;
}

function firstReply(persona: VirtualPersona, search: Search): { text: string; delayMs: number } | null {
  const p = priceFor(search);
  const name = shortName(search);
  switch (persona) {
    case "fast_pidgin":
      return {
        delayMs: rand(8_000, 15_000),
        text: pick([`we get am, ${p}`, `e dey o, ${kFormat(p)}`, `yes we get ${name}, ${p}`]),
      };
    case "price_quoter":
      return {
        delayMs: rand(15_000, 30_000),
        text: `Available. ${commas(p)} per one. ${pick([2, 3, 4])} remaining`,
      };
    case "out_with_eta":
      return {
        delayMs: rand(20_000, 40_000),
        text: pick(["e don finish, maybe Thursday", "Out of stock. Should come in by Friday", "we no get am now, check back tomorrow"]),
      };
    case "alternative": {
      const b = brands(search);
      const strength = search.strength ? ` ${search.strength}` : "";
      const altPrice = Math.max(100, Math.round((p * 0.85) / 100) * 100);
      return {
        delayMs: rand(25_000, 45_000),
        text:
          b.length >= 2
            ? `No ${b[0]} but we have ${b[1]}${strength}, ${altPrice}`
            : `We no get ${name} now, but we get another brand, same strength${strength}, ${altPrice}`,
      };
    }
    case "confused":
      return {
        delayMs: rand(12_000, 22_000),
        text:
          search.form === "inhaler" || search.form === "tablet"
            ? "abeg which one, the tablet or inhaler?"
            : "abeg which strength?",
      };
    case "silent":
      return null;
  }
}

function deliver(ask: Ask, search: Search, pharmacy: Pharmacy, text: string, delayMs: number) {
  setTimeout(() => {
    void (async () => {
      // Skip if the user cancelled the search meanwhile.
      const [current] = await getDb()
        .select({ status: schema.searches.status })
        .from(schema.searches)
        .where(and(eq(schema.searches.id, search.id), eq(schema.searches.ownerEmail, search.ownerEmail)))
        .limit(1);
      if (!current || current.status === "cancelled") return;
      await ingestInboundMessage({
        ownerEmail: ask.ownerEmail,
        askId: ask.id,
        pharmacyId: pharmacy.id,
        pharmacyName: pharmacy.name,
        text,
        channel: "virtual",
      });
    })().catch((err) => console.error("[rounds] virtual reply failed", err));
  }, delayMs).unref?.();
}

export function scheduleVirtualReply(ask: Ask, search: Search, pharmacy: Pharmacy, reask = false) {
  const persona = (pharmacy.virtualPersona ?? "fast_pidgin") as VirtualPersona;
  // Watch mode: the "out" pharmacy has restocked when asked again.
  const r =
    reask && persona === "out_with_eta"
      ? { text: `e don come o! we get am now, ${priceFor(search)}`, delayMs: rand(8_000, 15_000) }
      : firstReply(persona, search);
  if (r) deliver(ask, search, pharmacy, r.text, r.delayMs);
}

/** After the agent's clarifying question (message-pharmacy). */
export function scheduleVirtualFollowUp(ask: Ask, search: Search, pharmacy: Pharmacy) {
  const persona = (pharmacy.virtualPersona ?? "fast_pidgin") as VirtualPersona;
  const p = priceFor(search);
  const form = search.form ?? "one";
  const text =
    persona === "confused"
      ? `ok ${form} dey, ${p}`
      : persona === "out_with_eta"
        ? "no, e never come. maybe Thursday"
        : persona === "alternative"
          ? "yes same ingredient and strength"
          : `yes, ${p}`;
  deliver(ask, search, pharmacy, text, rand(8_000, 12_000));
}

/** The "silent" persona answers a nudge, so the demo shows Nudge working. */
export function scheduleVirtualNudgeReply(ask: Ask, search: Search, pharmacy: Pharmacy) {
  const p = priceFor(search);
  deliver(ask, search, pharmacy, `sorry o, just seeing this. e dey, ${p}`, rand(12_000, 20_000));
}

/** Demo pharmacies confirm holds after 5-15 seconds. */
export function scheduleVirtualHold(hold: Hold) {
  setTimeout(() => {
    void setHoldStatusCore(hold.ownerEmail, hold.id, "confirmed").catch((err) =>
      console.error("[rounds] virtual hold failed", err),
    );
  }, rand(5_000, 15_000)).unref?.();
}
