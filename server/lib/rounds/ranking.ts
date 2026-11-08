// Distance and ranking. Pure functions.

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

/** Move a point by (east, north) km. Used to spread seeded pharmacy pins. */
export function offsetPoint(
  p: { lat: number; lng: number },
  eastKm: number,
  northKm: number,
): { lat: number; lng: number } {
  const lat = p.lat + northKm / 110.574;
  const lng = p.lng + eastKm / (111.32 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

export type PharmacyCandidate = {
  id: string;
  distanceKm: number;
  reachable: boolean;
  lastKnown?: { availability: string; observedAt: number } | null;
};

/** Recent in-stock first, then reachable, then distance. */
export function rankPharmacies<T extends PharmacyCandidate>(list: T[]): T[] {
  const tier = (p: T) => {
    const a = p.lastKnown?.availability;
    if (a === "in_stock") return 0;
    if (a === "alternative") return 1;
    return 2;
  };
  return [...list].sort(
    (a, b) =>
      tier(a) - tier(b) ||
      Number(b.reachable) - Number(a.reachable) ||
      a.distanceKm - b.distanceKm,
  );
}

export type DisplayStatus =
  | "asked"
  | "reading"
  | "in_stock"
  | "out_of_stock"
  | "alternative"
  | "unclear"
  | "silent"
  | "send_failed"
  | "queued"
  | "cancelled";

export type RankableAsk = {
  id: string;
  displayStatus: DisplayStatus;
  priceNaira?: number | null;
  distanceKm: number;
  held?: boolean;
};

const STATUS_TIER: Record<DisplayStatus, number> = {
  in_stock: 0,
  alternative: 1,
  reading: 2,
  unclear: 3,
  asked: 4,
  queued: 4,
  out_of_stock: 5,
  silent: 6,
  send_failed: 7,
  cancelled: 8,
};

/** Board order: in stock (held first, then cheapest, then closest), alternatives, pending, out, silent. */
export function rankAsks<T extends RankableAsk>(asks: T[]): T[] {
  return [...asks].sort((a, b) => {
    const t = STATUS_TIER[a.displayStatus] - STATUS_TIER[b.displayStatus];
    if (t) return t;
    if (a.displayStatus === "in_stock" || a.displayStatus === "alternative") {
      const h = Number(Boolean(b.held)) - Number(Boolean(a.held));
      if (h) return h;
      const pa = a.priceNaira ?? Number.POSITIVE_INFINITY;
      const pb = b.priceNaira ?? Number.POSITIVE_INFINITY;
      if (pa !== pb) return pa - pb;
    }
    return a.distanceKm - b.distanceKm;
  });
}

/** "2m ago", "3h ago", "2d ago". */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function formatNaira(n: number): string {
  return `₦${n.toLocaleString("en-NG")}`;
}

export function lagosTime(ms: number): string {
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}
