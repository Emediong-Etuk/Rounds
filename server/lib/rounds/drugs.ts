// Pure drug-catalog matching. No database access here, so it is unit-testable.

export type CatalogDrug = {
  id: string;
  genericName: string;
  strength: string | null;
  form: string;
  brandNames: string[];
  aliases: string[];
  rxRequired: boolean;
  controlled: boolean;
  drugKey: string;
};

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9/.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `salbutamol|100mcg|inhaler` */
export function makeDrugKey(
  genericName: string,
  strength: string | null | undefined,
  form: string | null | undefined,
): string {
  const g = normalize(genericName).replace(/\s+/g, "-");
  const s = strength ? normalize(strength).replace(/\s+/g, "") : "";
  const f = form ? normalize(form).replace(/\s+/g, "-") : "";
  return `${g}|${s}|${f}`;
}

export function drugLabel(d: {
  genericName: string;
  strength?: string | null;
  form?: string | null;
}): string {
  return [d.genericName, d.strength, d.form].filter(Boolean).join(" ");
}

/** Pull a strength like "500mg", "100 mcg", "20/120mg", "5 mg" from text. */
export function parseStrength(query: string): string | undefined {
  const m = query
    .toLowerCase()
    .match(/(\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?)\s*(mcg|µg|ug|mg|g|iu\/ml|iu|ml)\b/);
  if (!m) return undefined;
  const unit = m[2] === "µg" || m[2] === "ug" ? "mcg" : m[2];
  return `${m[1]}${unit}`;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** Similarity of a query word to a name (0..1), tolerant of small typos. */
function wordScore(word: string, name: string): number {
  const n = normalize(name);
  if (!word || !n) return 0;
  if (n === word) return 1;
  const parts = n.split(/[\s/-]+/).filter(Boolean);
  let best = 0;
  for (const p of parts) {
    if (p === word) best = Math.max(best, 0.95);
    else if (word.length >= 4 && p.startsWith(word)) best = Math.max(best, 0.85);
    else if (p.length >= 4 && word.startsWith(p)) best = Math.max(best, 0.8);
    else if (word.length >= 5 && p.length >= 5) {
      const d = levenshtein(word, p);
      const tol = word.length >= 8 ? 2 : 1;
      if (d <= tol) best = Math.max(best, 0.75 - d * 0.05);
    }
  }
  if (best === 0 && word.length >= 4 && n.includes(word)) best = 0.6;
  return best;
}

const STOP = new Set([
  "i", "need", "a", "an", "the", "for", "my", "me", "some", "please", "abeg",
  "find", "near", "around", "in", "at", "do", "you", "have", "get", "looking",
  "want", "buy", "of", "and", "or", "is", "it", "tab", "tabs", "tablets",
  "tablet", "caps", "capsule", "capsules", "inhaler", "syrup", "injection",
  "sachet", "drug", "medicine", "brand", "any",
]);

const FORM_WORDS: Record<string, string> = {
  inhaler: "inhaler", puffer: "inhaler", pump: "inhaler",
  tablet: "tablet", tablets: "tablet", tab: "tablet", tabs: "tablet",
  capsule: "capsule", capsules: "capsule", caps: "capsule",
  syrup: "syrup", suspension: "syrup",
  injection: "injection", injectable: "injection", insulin: "injection",
  sachet: "sachet", sachets: "sachet",
};

export type DrugMatch = CatalogDrug & { label: string; score: number };

export function matchDrugs(
  query: string,
  catalog: CatalogDrug[],
  limit = 5,
): { matches: DrugMatch[]; parsedStrength?: string } {
  const q = normalize(query);
  const parsedStrength = parseStrength(query);
  const words = q
    .split(" ")
    .filter((w) => w && !STOP.has(w) && !/^\d/.test(w) && !/^(mg|mcg|ml|g)$/.test(w));
  const formHint = q
    .split(" ")
    .map((w) => FORM_WORDS[w])
    .find(Boolean);

  const scored: DrugMatch[] = [];
  for (const d of catalog) {
    const names = [d.genericName, ...d.brandNames, ...d.aliases];
    let nameScore = 0;
    for (const w of words) {
      for (const n of names) nameScore = Math.max(nameScore, wordScore(w, n));
    }
    // Multi-word aliases ("asthma inhaler") match on the whole phrase.
    for (const a of d.aliases) {
      const na = normalize(a);
      if (na.includes(" ") && q.includes(na)) nameScore = Math.max(nameScore, 0.9);
    }
    if (nameScore === 0) continue;
    let score = nameScore;
    if (parsedStrength && d.strength) {
      const ds = normalize(d.strength).replace(/\s+/g, "");
      if (ds === parsedStrength) score += 0.3;
      else score -= 0.15;
    }
    if (formHint) score += d.form === formHint ? 0.15 : -0.1;
    scored.push({ ...d, label: drugLabel(d), score: Math.round(score * 100) / 100 });
  }
  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return { matches: scored.slice(0, limit), ...(parsedStrength ? { parsedStrength } : {}) };
}
