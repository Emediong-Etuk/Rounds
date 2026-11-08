import { describe, expect, it } from "vitest";

import { haversineKm, offsetPoint, rankAsks, rankPharmacies } from "./ranking.js";

describe("haversine", () => {
  it("is ~0 for the same point", () => {
    expect(haversineKm({ lat: 4.8, lng: 7 }, { lat: 4.8, lng: 7 })).toBeCloseTo(0, 5);
  });
  it("measures Port Harcourt to Uyo at roughly 85-95 km", () => {
    const d = haversineKm({ lat: 4.8156, lng: 7.0498 }, { lat: 5.0377, lng: 7.9128 });
    expect(d).toBeGreaterThan(85);
    expect(d).toBeLessThan(100);
  });
  it("offsetPoint moves about the requested distance", () => {
    const p = { lat: 4.837, lng: 7.011 };
    expect(haversineKm(p, offsetPoint(p, 1, 0))).toBeCloseTo(1, 1);
    expect(haversineKm(p, offsetPoint(p, 0, 2))).toBeCloseTo(2, 1);
  });
});

describe("pharmacy ranking", () => {
  it("puts recent in-stock first, then reachable, then distance", () => {
    const r = rankPharmacies([
      { id: "far", distanceKm: 4, reachable: true },
      { id: "near-unreachable", distanceKm: 0.5, reachable: false },
      { id: "near", distanceKm: 1, reachable: true },
      { id: "had-it", distanceKm: 3, reachable: true, lastKnown: { availability: "in_stock", observedAt: 1 } },
    ]);
    expect(r.map((p) => p.id)).toEqual(["had-it", "near", "far", "near-unreachable"]);
  });
});

describe("board ranking", () => {
  it("orders in stock by hold, price, distance; then alternatives; out and silent last", () => {
    const r = rankAsks([
      { id: "silent", displayStatus: "silent", distanceKm: 0.2 },
      { id: "out", displayStatus: "out_of_stock", distanceKm: 0.1 },
      { id: "alt", displayStatus: "alternative", distanceKm: 1, priceNaira: 100 },
      { id: "cheap", displayStatus: "in_stock", distanceKm: 3, priceNaira: 3000 },
      { id: "dear", displayStatus: "in_stock", distanceKm: 1, priceNaira: 4200 },
      { id: "held", displayStatus: "in_stock", distanceKm: 2, priceNaira: 5000, held: true },
      { id: "asked", displayStatus: "asked", distanceKm: 0.5 },
    ]);
    expect(r.map((a) => a.id)).toEqual(["held", "cheap", "dear", "alt", "asked", "out", "silent"]);
  });
});
