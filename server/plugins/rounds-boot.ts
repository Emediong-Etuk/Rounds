import { defineNitroPlugin } from "@agent-native/core/server";

import { isSeeded, seedReferenceData } from "../lib/rounds/seed.js";

// Seed the shared reference data (areas, drugs, demo pharmacies) once on an
// empty database so a fresh deploy demos immediately. Migrations run in
// another plugin, so retry briefly until the tables exist.
export default defineNitroPlugin(() => {
  let attempts = 0;
  const run = async () => {
    attempts++;
    try {
      if (!(await isSeeded())) {
        const r = await seedReferenceData();
        console.log(`[rounds] seeded ${r.areas} areas, ${r.drugs} drugs, ${r.pharmacies} pharmacies`);
      }
    } catch (err) {
      if (attempts < 6) setTimeout(run, 3000);
      else console.error("[rounds] seed failed", err);
    }
  };
  setTimeout(run, 2000);
});
