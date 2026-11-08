import { describe, expect, it } from "vitest";

import { parsePrice, parseReply } from "./parse-reply.js";

const inhaler = { strength: "100mcg", form: "inhaler" };

type Case = [string, Partial<ReturnType<typeof parseReply>>, Parameters<typeof parseReply>[1]?];

const cases: Case[] = [
  // Spec examples
  ["we get am 3500", { availability: "in_stock", priceNaira: 3500 }],
  ["e don finish o", { availability: "out_of_stock" }],
  ["no but we get asthalin 3k", { availability: "alternative", priceNaira: 3000 }],
  ["abeg which strength?", { availability: "unclear" }],
  ["available, 2 remaining, 4,200", { availability: "in_stock", priceNaira: 4200, quantity: 2 }],
  ["out. Thursday", { availability: "out_of_stock", restockEta: "Thursday" }],
  // Positives
  ["yes 3500", { availability: "in_stock", priceNaira: 3500 }],
  ["Yes we have it", { availability: "in_stock" }],
  ["e dey o, 3.5k", { availability: "in_stock", priceNaira: 3500 }],
  ["we get am, 3k5", { availability: "in_stock", priceNaira: 3500 }],
  ["Available. ₦4,200 per one. 3 remaining", { availability: "in_stock", priceNaira: 4200, quantity: 3 }],
  ["In stock N3,800", { availability: "in_stock", priceNaira: 3800 }],
  ["come and buy, 3500 naira", { availability: "in_stock", priceNaira: 3500 }],
  ["dey, 35 hundred", { availability: "in_stock", priceNaira: 3500 }],
  ["3500", { availability: "in_stock", priceNaira: 3500 }],
  ["NGN 2500", { availability: "in_stock", priceNaira: 2500 }],
  ["sure, we have 5 packs, 2800", { availability: "in_stock", priceNaira: 2800, quantity: 5 }],
  ["no problem we have it, 3000", { availability: "in_stock", priceNaira: 3000 }],
  // Negatives
  ["e don finish, maybe Thursday", { availability: "out_of_stock", restockEta: "Thursday" }],
  ["No", { availability: "out_of_stock" }],
  ["we no get am", { availability: "out_of_stock" }],
  ["e no dey", { availability: "out_of_stock" }],
  ["Not available. Should come in by Friday", { availability: "out_of_stock", restockEta: "Friday" }],
  ["out of stock, tomorrow", { availability: "out_of_stock", restockEta: "Tomorrow" }],
  ["sorry we don't have it, next week", { availability: "out_of_stock", restockEta: "Next week" }],
  ["exhausted", { availability: "out_of_stock" }],
  // Alternatives
  ["No Ventolin but we have Asthalin 100mcg, 3000", { availability: "alternative", priceNaira: 3000 }, inhaler],
  ["only 200mcg dey", { availability: "alternative" }, inhaler],
  ["we have the tablets, 500", { availability: "alternative", priceNaira: 500 }, inhaler],
  ["e no dey, only the tablets", { availability: "alternative" }],
  // Unclear
  ["abeg which one, the tablet or inhaler?", { availability: "unclear" }],
  ["hello", { availability: "unclear" }],
  ["who is this?", { availability: "unclear" }],
  ["", { availability: "unclear" }],
];

describe("parseReply", () => {
  it.each(cases)("%s", (text, expected, ctx) => {
    const r = parseReply(text, ctx ?? {});
    expect(r).toMatchObject(expected);
    expect(r.confidence).toBeGreaterThan(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it("returns confidence 0.3 for unclear", () => {
    expect(parseReply("hmm").confidence).toBe(0.3);
  });
});

describe("parsePrice", () => {
  it("never reads strengths as prices", () => {
    expect(parsePrice("Asthalin 100mcg")).toBeUndefined();
    expect(parsePrice("coartem 20/120mg 2500")).toBe(2500);
  });
  it("ignores values outside 50..2,000,000", () => {
    expect(parsePrice("10")).toBeUndefined();
    expect(parsePrice("5000000")).toBeUndefined();
  });
  it("handles k notation", () => {
    expect(parsePrice("4.2k")).toBe(4200);
    expect(parsePrice("3k")).toBe(3000);
    expect(parsePrice("3k5")).toBe(3500);
  });
});
