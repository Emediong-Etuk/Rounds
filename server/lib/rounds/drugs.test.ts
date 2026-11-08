import { describe, expect, it } from "vitest";

import { makeDrugKey, matchDrugs, parseStrength, type CatalogDrug } from "./drugs.js";
import { SEED_DRUGS } from "./seed-data.js";

const catalog: CatalogDrug[] = SEED_DRUGS.map((d) => ({
  id: d.id,
  genericName: d.genericName,
  strength: d.strength,
  form: d.form,
  brandNames: d.brandNames,
  aliases: d.aliases,
  rxRequired: d.rxRequired,
  controlled: Boolean(d.controlled),
  drugKey: makeDrugKey(d.genericName, d.strength, d.form),
}));

const top = (q: string) => matchDrugs(q, catalog).matches[0]?.id;

describe("drug matching", () => {
  it("makes stable drug keys", () => {
    expect(makeDrugKey("Salbutamol", "100mcg", "inhaler")).toBe("salbutamol|100mcg|inhaler");
    expect(makeDrugKey("Oral rehydration salts", null, "sachet")).toBe("oral-rehydration-salts||sachet");
  });
  it("parses strengths", () => {
    expect(parseStrength("amoxil 500mg")).toBe("500mg");
    expect(parseStrength("ventolin 100 mcg")).toBe("100mcg");
    expect(parseStrength("coartem 20/120mg")).toBe("20/120mg");
    expect(parseStrength("panadol")).toBeUndefined();
  });
  it("matches brands to generics", () => {
    expect(top("ventolin")).toBe("drug_salbutamol_inh");
    expect(top("I need a Ventolin inhaler")).toBe("drug_salbutamol_inh");
    expect(top("coartem")).toBe("drug_coartem");
    expect(top("augmentin")).toBe("drug_augmentin");
    expect(top("panadol")).toBe("drug_paracetamol");
    expect(top("flagyl")).toBe("drug_metronidazole");
  });
  it("tolerates small typos", () => {
    expect(top("ventoline")).toBe("drug_salbutamol_inh");
    expect(top("metformine")).toBe("drug_metformin");
  });
  it("uses strength and form to break ties", () => {
    expect(top("amlodipine 10mg")).toBe("drug_amlodipine10");
    expect(top("amlodipine 5mg")).toBe("drug_amlodipine5");
    expect(top("salbutamol tablets 4mg")).toBe("drug_salbutamol_tab");
  });
  it("flags controlled drugs", () => {
    const m = matchDrugs("tramadol", catalog).matches[0];
    expect(m?.controlled).toBe(true);
  });
  it("returns nothing for unknown text", () => {
    expect(matchDrugs("zzqx", catalog).matches).toEqual([]);
  });
});
