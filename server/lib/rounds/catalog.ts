import { fail } from "@agent-native/core/action";
import { and, desc, eq, gte, inArray } from "drizzle-orm";

import { getDb, schema } from "../../db/index.js";
import { normalize, type CatalogDrug } from "./drugs.js";
import { ago, haversineKm, rankPharmacies, roundKm } from "./ranking.js";

const parseList = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

export async function loadCatalog(): Promise<CatalogDrug[]> {
  const rows = await getDb().select().from(schema.drugs).limit(500);
  return rows.map((r) => ({
    id: r.id,
    genericName: r.genericName,
    strength: r.strength,
    form: r.form,
    brandNames: parseList(r.brandNames),
    aliases: parseList(r.aliases),
    rxRequired: r.rxRequired,
    controlled: r.controlled,
    drugKey: r.drugKey,
  }));
}

export async function getDrugById(id: string): Promise<CatalogDrug | null> {
  const [r] = await getDb().select().from(schema.drugs).where(eq(schema.drugs.id, id)).limit(1);
  if (!r) return null;
  return {
    id: r.id,
    genericName: r.genericName,
    strength: r.strength,
    form: r.form,
    brandNames: parseList(r.brandNames),
    aliases: parseList(r.aliases),
    rxRequired: r.rxRequired,
    controlled: r.controlled,
    drugKey: r.drugKey,
  };
}

export type Area = { id: string; name: string; city: string; lat: number; lng: number };

export async function listAreas(): Promise<Area[]> {
  return getDb().select().from(schema.areas).orderBy(schema.areas.city, schema.areas.name).limit(200);
}

/** Fuzzy area lookup: exact, prefix, contains, then close spelling. */
export function matchArea(query: string, areas: Area[]): { match?: Area | undefined; suggestions: Area[] } {
  const q = normalize(query).replace(/\b(port harcourt|ph|uyo|area|road)\b/g, (m) => (m === "road" ? m : "")).trim();
  const qq = q.replace(/[\s-]/g, "");
  const scored = areas
    .map((a) => {
      const n = normalize(a.name).replace(/[\s-]/g, "");
      let s = 0;
      if (n === qq) s = 1;
      else if (qq && (n.startsWith(qq) || qq.startsWith(n))) s = 0.85;
      else if (qq.length >= 3 && (n.includes(qq) || qq.includes(n))) s = 0.7;
      else {
        let d = 0;
        const a1 = n, b1 = qq;
        // small edit distance on compacted names
        const m = Array.from({ length: b1.length + 1 }, (_, i) => i);
        for (let i = 1; i <= a1.length; i++) {
          let prev = m[0]!;
          m[0] = i;
          for (let j = 1; j <= b1.length; j++) {
            const tmp = m[j]!;
            m[j] = Math.min(m[j]! + 1, m[j - 1]! + 1, prev + (a1[i - 1] === b1[j - 1] ? 0 : 1));
            prev = tmp;
          }
        }
        d = m[b1.length]!;
        if (d <= 2 && qq.length >= 4) s = 0.6 - d * 0.1;
      }
      return { a, s };
    })
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s);
  const best = scored[0];
  return {
    match: best && best.s >= 0.5 ? best.a : undefined,
    suggestions: scored.slice(0, 4).map((x) => x.a),
  };
}

export type FoundPharmacy = {
  id: string;
  name: string;
  areaName: string;
  city: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  reachable: boolean;
  isVirtual: boolean;
  lastKnown?: {
    availability: string;
    priceNaira: number | null;
    observedAt: number;
    ago: string;
  } | null;
};

const MEMORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export async function latestObservations(
  drugKey: string,
  pharmacyIds: string[],
): Promise<Map<string, { availability: string; priceNaira: number | null; observedAt: number }>> {
  const out = new Map<string, { availability: string; priceNaira: number | null; observedAt: number }>();
  if (!pharmacyIds.length) return out;
  const rows = await getDb()
    .select({
      pharmacyId: schema.stockObservations.pharmacyId,
      availability: schema.stockObservations.availability,
      priceNaira: schema.stockObservations.priceNaira,
      observedAt: schema.stockObservations.observedAt,
    })
    .from(schema.stockObservations)
    .where(
      and(
        eq(schema.stockObservations.drugKey, drugKey),
        inArray(schema.stockObservations.pharmacyId, pharmacyIds),
        gte(schema.stockObservations.observedAt, Date.now() - MEMORY_WINDOW_MS),
      ),
    )
    .orderBy(desc(schema.stockObservations.observedAt))
    .limit(500);
  for (const r of rows) if (!out.has(r.pharmacyId)) out.set(r.pharmacyId, r);
  return out;
}

export async function findPharmaciesCore(input: {
  origin: { lat: number; lng: number };
  radiusKm: number;
  drugKey?: string | undefined;
  limit: number;
  reachableOnly: boolean;
  excludeIds?: string[] | undefined;
}): Promise<FoundPharmacy[]> {
  const db = getDb();
  const [rows, areas] = await Promise.all([
    db.select().from(schema.pharmacies).limit(1000),
    listAreas(),
  ]);
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const exclude = new Set(input.excludeIds ?? []);
  let list: FoundPharmacy[] = rows
    .filter((p) => !exclude.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      areaName: areaName.get(p.areaId) ?? "",
      city: p.city,
      address: p.address,
      phone: p.phone,
      lat: p.lat,
      lng: p.lng,
      distanceKm: roundKm(haversineKm(input.origin, p)),
      reachable: Boolean(p.telegramChatId) || p.isVirtual,
      isVirtual: p.isVirtual,
    }))
    .filter((p) => p.distanceKm <= input.radiusKm)
    .filter((p) => !input.reachableOnly || p.reachable);

  if (input.drugKey) {
    const obs = await latestObservations(input.drugKey, list.map((p) => p.id));
    list = list.map((p) => {
      const o = obs.get(p.id);
      return o ? { ...p, lastKnown: { ...o, ago: ago(o.observedAt) } } : p;
    });
  }
  return rankPharmacies(list).slice(0, input.limit);
}

export async function resolveOrigin(args: {
  area?: string | undefined;
  lat?: number | undefined;
  lng?: number | undefined;
}) {
  if (typeof args.lat === "number" && typeof args.lng === "number") {
    const areas = await listAreas();
    // Label "my location" with the nearest known area for pharmacist messages.
    let nearest = areas[0];
    let best = Number.POSITIVE_INFINITY;
    for (const a of areas) {
      const d = (a.lat - args.lat) ** 2 + (a.lng - args.lng) ** 2;
      if (d < best) { best = d; nearest = a; }
    }
    return { lat: args.lat, lng: args.lng, label: nearest ? `near ${nearest.name}` : "your location" };
  }
  if (!args.area) {
    fail("Tell me an area (e.g. Rumuola) or share your location.", { errorCode: "missing_origin", statusCode: 400 });
  }
  const areas = await listAreas();
  const { match, suggestions } = matchArea(args.area, areas);
  if (!match) {
    fail(`I don't know "${args.area}" yet.`, {
      errorCode: "unknown_area",
      statusCode: 404,
      details: {
        suggestions: (suggestions.length ? suggestions : areas.slice(0, 6)).map((s) => `${s.name}, ${s.city}`),
      },
    });
  }
  return { lat: match.lat, lng: match.lng, label: match.name };
}
