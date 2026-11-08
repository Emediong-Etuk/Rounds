// Deterministic fallback parser for pharmacist replies (English + light Pidgin).
// The agent is the primary reader; this runs when REPLY_PARSER=rules, or when a
// message has waited more than 60 seconds without being read.

export type Availability = "in_stock" | "out_of_stock" | "alternative" | "unclear";

export type ParsedReply = {
  availability: Availability;
  priceNaira?: number;
  quantity?: number;
  restockEta?: string;
  alternativeText?: string;
  confidence: number;
};

export type ParseContext = {
  /** Requested strength, e.g. "100mcg". A different strength means alternative. */
  strength?: string | null | undefined;
  /** Requested form, e.g. "inhaler". A different form means alternative. */
  form?: string | null | undefined;
};

const MIN_PRICE = 50;
const MAX_PRICE = 2_000_000;

const NEGATIVE = [
  /\be\s+don\s+finish\b/,
  /\bdon\s+finish\b/,
  /\bfinish(?:ed)?\b/,
  /\bwe\s+no\s+(?:get|have)\b/,
  /\bno\s+dey\b/,
  /\bnot\s+(?:available|in\s+stock|there)\b/,
  /\bunavailable\b/,
  /\bout\s+of\s+stock\b/,
  /\bout\b/,
  /\bsold\s+out\b/,
  /\bexhausted\b/,
  /\b(?:don'?t|do\s+not|dont)\s+have\b/,
  /\bwe\s+(?:don'?t|dont)\b/,
  /\bnone\b/,
  /\bno\b(?!\s+(?:problem|wahala|qualms))/,
  /\bnope\b/,
];

const POSITIVE = [
  /\byes\b/,
  /\byeah\b/,
  /\byep\b/,
  /\bavailable\b/,
  /\bwe\s+(?:have|get)\b/,
  /\bget\s+am\b/,
  /\be\s+dey\b/,
  /\bdey\b/,
  /\bin\s+stock\b/,
  /\bcome\s+(?:and\s+)?buy\b/,
  /\bhave\s+it\b/,
  /\bgot\s+it\b/,
  /\bsure\b/,
  /\bthere\s+is\b/,
];

const FORMS: Record<string, string> = {
  inhaler: "inhaler", inhalers: "inhaler", puffer: "inhaler",
  tablet: "tablet", tablets: "tablet", tab: "tablet", tabs: "tablet",
  capsule: "capsule", capsules: "capsule", caps: "capsule",
  syrup: "syrup", suspension: "syrup",
  injection: "injection", injections: "injection", vial: "injection",
  sachet: "sachet", sachets: "sachet",
};

const WEEKDAYS: Record<string, string> = {
  monday: "Monday", mon: "Monday",
  tuesday: "Tuesday", tue: "Tuesday", tues: "Tuesday",
  wednesday: "Wednesday", wed: "Wednesday",
  thursday: "Thursday", thur: "Thursday", thurs: "Thursday", thu: "Thursday",
  friday: "Friday", fri: "Friday",
  saturday: "Saturday", sat: "Saturday",
  sunday: "Sunday", sun: "Sunday",
};

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const any = (t: string, list: RegExp[]) => list.some((r) => r.test(t));

/** Parse a naira amount out of free text. Returns undefined if none. */
export function parsePrice(raw: string): number | undefined {
  // Strip strengths ("100mcg", "20/120mg") so they are never read as prices.
  let t = clean(raw).replace(
    /\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?\s*(?:mcg|µg|ug|mg|ml|iu|g)\b/g,
    " ",
  );
  // Strip quantities ("2 packs", "3 left", "remain 2").
  t = t
    .replace(/\b\d+\s*(?:packs?|pieces?|pcs|left|remaining|remain|units?|boxes?|cartons?|sachets?|tablets?|tabs?|inhalers?|bottles?)\b/g, " ")
    .replace(/\b(?:remain(?:ing)?|left)\s*\d+\b/g, " ");

  const candidates: Array<{ value: number; strong: boolean; index: number }> = [];
  const push = (value: number, strong: boolean, index: number) => {
    if (Number.isFinite(value)) candidates.push({ value: Math.round(value), strong, index });
  };

  // 3k5 → 3500
  for (const m of t.matchAll(/\b(\d+)k(\d)\b/g)) push(Number(m[1]) * 1000 + Number(m[2]) * 100, true, m.index!);
  // 3.5k / 3k
  for (const m of t.matchAll(/(?:₦|\bngn\s?|\bn\s?)?\b(\d+(?:\.\d+)?)\s?k\b/g)) push(Number(m[1]) * 1000, true, m.index!);
  // 35 hundred
  for (const m of t.matchAll(/\b(\d+)\s+hundred\b/g)) push(Number(m[1]) * 100, true, m.index!);
  // ₦3,500 / N3500 / NGN 3500 / 3500 naira
  for (const m of t.matchAll(/(?:₦|\bngn\s?|\bn)\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\b(?!\s?k\b)/g))
    push(Number(m[1]!.replace(/,/g, "")), true, m.index!);
  for (const m of t.matchAll(/\b(\d{1,3}(?:,\d{3})+|\d+)\s*(?:naira|ngn)\b/g))
    push(Number(m[1]!.replace(/,/g, "")), true, m.index!);
  // Plain numbers: 3500 / 4,200
  for (const m of t.matchAll(/(?<![\d.,k])(\d{1,3}(?:,\d{3})+|\d{2,7})(?![\d.,]|\s?k\b|k\d)/g))
    push(Number(m[1]!.replace(/,/g, "")), false, m.index!);

  const valid = candidates.filter((c) => c.value >= MIN_PRICE && c.value <= MAX_PRICE);
  if (!valid.length) return undefined;
  const strong = valid.filter((c) => c.strong).sort((a, b) => a.index - b.index);
  if (strong.length) return strong[0]!.value;
  return valid.sort((a, b) => a.index - b.index)[0]!.value;
}

export function parseQuantity(raw: string): number | undefined {
  const t = clean(raw);
  const m =
    t.match(/\b(\d{1,4})\s*(?:packs?|pieces?|pcs|left|remaining|remain|units?|boxes?|cartons?|bottles?)\b/) ??
    t.match(/\b(?:remain(?:ing)?|left)\s*(\d{1,4})\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n > 0 && n <= 1000 ? n : undefined;
}

export function parseRestock(raw: string): string | undefined {
  const t = clean(raw);
  if (/\bnext\s+week\b/.test(t)) return "Next week";
  if (/\b(?:tomorrow|tmrw|tmr|tomoro|tomorow|tumoro)\b/.test(t)) return "Tomorrow";
  if (/\blater\s+today\b|\bthis\s+evening\b/.test(t)) return "Later today";
  if (/\bnext\s+month\b/.test(t)) return "Next month";
  for (const [k, v] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${k}\\b`).test(t)) return v;
  }
  return undefined;
}

function mentionedStrengths(t: string): string[] {
  return [...t.matchAll(/(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*(mcg|µg|ug|mg|ml|iu)\b/g)].map(
    (m) => `${m[1]}${m[2] === "µg" || m[2] === "ug" ? "mcg" : m[2]}`,
  );
}

function mentionedForms(t: string): string[] {
  return t
    .split(/[^a-z]+/)
    .map((w) => FORMS[w])
    .filter((f): f is string => Boolean(f));
}

function alternativeClause(raw: string): string | undefined {
  const m = raw.match(/\b(?:but|only|instead|however)\b[\s,:-]*(.+)$/i);
  const text = (m?.[1] ?? raw)
    .trim()
    .replace(/[.!]+$/, "")
    // Drop a trailing price ("…, 3700", "… 3.5k", "… ₦3,000"): it's stored separately.
    .replace(/[\s,;:-]*(?:₦|n|ngn)?\s?\d[\d,.]*\s?(?:k\d?|naira)?\s*$/i, "")
    .trim();
  return text ? text.slice(0, 200) : undefined;
}

export function parseReply(raw: string, ctx: ParseContext = {}): ParsedReply {
  const t = clean(raw);
  const priceNaira = parsePrice(raw);
  const quantity = parseQuantity(raw);
  const restockEta = parseRestock(raw);
  const extras = {
    ...(priceNaira !== undefined ? { priceNaira } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
  };

  if (!t) return { availability: "unclear", confidence: 0.3 };

  const neg = any(t, NEGATIVE);
  const pos = any(t, POSITIVE);
  const question = /\?/.test(t) || /^(?:abeg\s+)?(?:which|what|is\s+it|do\s+you\s+mean|na\s+which)\b/.test(t);

  // "no Ventolin but we have Asthalin", "e no dey, only the tablets"
  const offersOther =
    /\b(?:but|only|instead|however)\b.*\b(?:we\s+have|we\s+get|have|get|dey|there\s+is|got)\b/.test(t) ||
    /\bonly\s+(?:the\s+)?(?:\d|[a-z]+\s+(?:\d|tablets?|syrup|inhaler|capsules?))/.test(t) ||
    /\bonly\s+(?:the\s+)?(?:tablets?|syrup|inhalers?|capsules?|injection|sachets?)\b/.test(t) ||
    /\b(?:another|other|different)\s+(?:brand|strength|one)\b/.test(t);

  // Positive but for a different strength/form than requested.
  const reqStrength = ctx.strength?.toLowerCase().replace(/\s+/g, "");
  const strengths = mentionedStrengths(t);
  const differentStrength = Boolean(reqStrength && strengths.length && !strengths.includes(reqStrength));
  const forms = mentionedForms(t);
  const differentForm = Boolean(ctx.form && forms.length && !forms.includes(ctx.form));

  if (question && !pos && !neg) return { availability: "unclear", confidence: 0.3 };
  if (question && /\b(?:which|what)\b/.test(t) && !offersOther) {
    return { availability: "unclear", confidence: 0.35 };
  }

  if ((neg && offersOther) || (pos && (differentStrength || differentForm)) || (!neg && offersOther && /\bonly\b/.test(t))) {
    const alternativeText = alternativeClause(raw);
    return {
      availability: "alternative",
      ...extras,
      ...(alternativeText ? { alternativeText } : {}),
      confidence: 0.7,
    };
  }

  if (neg) {
    return {
      availability: "out_of_stock",
      ...(restockEta ? { restockEta } : {}),
      confidence: pos ? 0.6 : 0.85,
    };
  }

  if (pos) {
    return { availability: "in_stock", ...extras, confidence: priceNaira ? 0.85 : 0.75 };
  }

  // Just a number ("3500") is almost always "yes, at this price".
  if (priceNaira !== undefined && t.replace(/[^a-z]/g, "").length <= 8) {
    return { availability: "in_stock", ...extras, confidence: 0.6 };
  }

  return { availability: "unclear", confidence: 0.3 };
}
