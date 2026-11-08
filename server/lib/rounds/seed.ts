import { sql } from "drizzle-orm";

import { getDb, schema } from "../../db/index.js";
import { makeDrugKey } from "./drugs.js";
import { offsetPoint } from "./ranking.js";
import { SEED_AREAS, SEED_DRUGS, SEED_PHARMACIES } from "./seed-data.js";

/**
 * Idempotent: upserts by stable id. Re-seeding never clears a pharmacy's
 * Telegram connection.
 */
export async function seedReferenceData(): Promise<{
  areas: number;
  drugs: number;
  pharmacies: number;
}> {
  const db = getDb();
  const now = Date.now();

  for (const a of SEED_AREAS) {
    await db
      .insert(schema.areas)
      .values(a)
      .onConflictDoUpdate({
        target: schema.areas.id,
        set: { name: a.name, city: a.city, lat: a.lat, lng: a.lng },
      });
  }

  for (const d of SEED_DRUGS) {
    const row = {
      id: d.id,
      genericName: d.genericName,
      strength: d.strength,
      form: d.form,
      brandNames: JSON.stringify(d.brandNames),
      aliases: JSON.stringify(d.aliases),
      rxRequired: d.rxRequired,
      controlled: Boolean(d.controlled),
      drugKey: makeDrugKey(d.genericName, d.strength, d.form),
    };
    const { id: _id, ...set } = row;
    await db
      .insert(schema.drugs)
      .values(row)
      .onConflictDoUpdate({ target: schema.drugs.id, set });
  }

  const areaById = new Map(SEED_AREAS.map((a) => [a.id, a]));
  for (const p of SEED_PHARMACIES) {
    const area = areaById.get(p.areaId)!;
    const point = offsetPoint(area, p.offsetKm[0], p.offsetKm[1]);
    const values = {
      id: p.id,
      name: p.name,
      areaId: p.areaId,
      city: area.city,
      address: `${p.street}, ${area.name}, ${area.city}`,
      lat: point.lat,
      lng: point.lng,
      phone: p.phone,
      connectCode: p.connectCode,
      isVirtual: Boolean(p.isVirtual),
      virtualPersona: p.persona ?? null,
      createdAt: now,
    };
    await db
      .insert(schema.pharmacies)
      .values(values)
      .onConflictDoUpdate({
        target: schema.pharmacies.id,
        set: {
          name: values.name,
          areaId: values.areaId,
          city: values.city,
          address: values.address,
          lat: values.lat,
          lng: values.lng,
          phone: values.phone,
          isVirtual: values.isVirtual,
          virtualPersona: values.virtualPersona,
        },
      });
  }

  await seedStockMemory(now);

  return {
    areas: SEED_AREAS.length,
    drugs: SEED_DRUGS.length,
    pharmacies: SEED_PHARMACIES.length,
  };
}

/** A couple of historical observations so "had it 2 days ago" shows on day one. */
async function seedStockMemory(now: number) {
  const db = getDb();
  const day = 24 * 60 * 60 * 1000;
  const rows = [
    { id: "obs_seed_1", pharmacyId: "ph_greenleaf", drugId: "drug_salbutamol_inh", availability: "in_stock", priceNaira: 3400, observedAt: now - 2 * day },
    { id: "obs_seed_2", pharmacyId: "ph_riverscare", drugId: "drug_coartem", availability: "in_stock", priceNaira: 2500, observedAt: now - 1 * day },
    { id: "obs_seed_3", pharmacyId: "uy_ibomhealth", drugId: "drug_coartem", availability: "in_stock", priceNaira: 2300, observedAt: now - 3 * day },
  ];
  const drugById = new Map(SEED_DRUGS.map((d) => [d.id, d]));
  for (const r of rows) {
    const d = drugById.get(r.drugId)!;
    await db
      .insert(schema.stockObservations)
      .values({
        id: r.id,
        pharmacyId: r.pharmacyId,
        drugKey: makeDrugKey(d.genericName, d.strength, d.form),
        drugLabel: [d.genericName, d.strength, d.form].filter(Boolean).join(" "),
        availability: r.availability,
        priceNaira: r.priceNaira,
        observedAt: r.observedAt,
        source: "seed",
      })
      .onConflictDoNothing();
  }
}

export async function isSeeded(): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute(sql`SELECT count(*)::int AS n FROM drugs`);
  const list = (Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows) as Array<{ n: number }>;
  return Number(list[0]?.n ?? 0) > 0;
}
