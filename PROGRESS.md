# Rounds — progress log

## Status
- [x] Phase 0: scaffold + spikes
- [x] Phase 1: data + seed (schema, migration, seed-on-boot, resolve-drug, list-areas, find-pharmacies, tests)
- [x] Phase 2: search, board, virtual pharmacies (rules parser + 38 parser tests, live board, edit, holds, nudges, dev panel)
- [x] Phase 3: agent (AGENTS.md, view-screen board snapshot + selection, automations installer, navigate-to-board, sendToAgentChat buttons). Live agent NOT tested here: no LLM key in this sandbox
- [ ] Phase 4: public reply link
- [ ] Phase 5: Telegram
- [ ] Phase 6: stock memory + polish
- [x] Phase 7: watch mode (list-watched-searches, re-ask-out-of-stock, rounds-watch automation, board button). Test with Settings → Automations → Run now
- [ ] Phase 8: deploy + submission assets

## Framework facts (checked against installed @agent-native/core 0.226.0)
- Template: Chat (`--standalone --template chat`). No DB files shipped; we add
  `server/db/schema.ts`, `server/db/index.ts` (`createGetDb(schema)`),
  `server/plugins/db.ts` (`runMigrations([...], { table })`).
- "Guards" = Agent-Native Doctor. `pnpm guards` is an alias for
  `agent-native doctor` (plain `pnpm doctor` is pnpm's own command).
- Reference tables with no owner (areas, drugs, pharmacies, stock_observations,
  telegram_updates) must be listed in `agent-native.json` →
  `doctor.dbToolScopingDenylist` with a reason. The agent reads them through
  actions, not raw SQL.
- `process.env.X` reads for non-allowlisted keys need
  `// guard:allow-env-credential — reason` (deploy-level bot token etc).
- Auth plugin is `createToolkitAuthPlugin(...)`; it accepts `publicPaths`.
  **Prefix matching confirmed**: `/api/telegram/ping` is public, other `/api/*`
  routes return 401.
- Custom routes: `runWithRequestContext({ userEmail, orgId }, fn)` from
  `@agent-native/core/server`.
- Event bus: `registerEvent` / `emit(name, payload, { owner })` from
  `@agent-native/core/event-bus`. **Confirmed**: emit → personal event
  automation (written with `resourcePut(ownerEmail, "jobs/x.md", md)` from
  `@agent-native/core/resources`) is matched and an agent run starts.
  Locally it fails with `missing_credentials` because no LLM key is set.
  After 3 failures in a row an event automation pauses itself.
- CLI identity: `AGENT_USER_EMAIL=you@x.com pnpm action <name> --arg v`.
  Without it `ctx.userEmail` is undefined.
- Dev server: this sandbox has no IPv6, so run
  `pnpm exec agent-native dev --host 127.0.0.1` (port 8080).

## Decisions (sensible defaults, change if you disagree)
- User-owned tables use a plain `owner_email` column (private to the creator),
  not `ownableColumns()`; searches are not shared between users.
- Ids are `srch_`/`ask_`/... + random suffix.

## Manual steps for Greg
- Put `ANTHROPIC_API_KEY` in `.env` (or connect a provider in Settings → Agent)
  — the agent and the reply-reading automation need it.
- Seed runs automatically on boot when the `drugs` table is empty
  (`server/plugins/rounds-boot.ts`). Re-seed any time with
  `pnpm action seed-demo-data` (idempotent, keeps Telegram connections).
  `pnpm seed` is not used because PGlite is single-process.
- 24 fictional pharmacies: 12 virtual (6 personas × PH and Uyo), 3 demo-phone
  pharmacies near Rumuola/GRA for real Telegram (connect codes OAKLN7, PLMCT8,
  HRBMD9), 9 directory-only.

## Phase 2 notes
- Domain home is `/rounds` (sign-in lands there via `homePath`); board is
  `/s/:id`; directory is `/pharmacies`. The template's `/home` and `/chat`
  are unchanged.
- In DEMO_MODE, demo pharmacies show "Silent" after 75 s (real pharmacies:
  15 min) so the Nudge button appears during a demo. The silent persona
  answers a nudge ~15 s later.
- Two-user isolation checked with the CLI: another account gets
  "Search not found" / "Ask not found".

## Manual tests (Phase 2)
1. `pnpm exec agent-native dev --host 127.0.0.1`, open http://127.0.0.1:8080,
   "Continue as local dev".
2. Find medicine → type "ventolin" → Find it → Yes → Ask 6 pharmacies.
3. Within ~45 s: 2 in stock with prices, 1 alternative (Asthalin), 1 out
   (with restock day), 1 unclear, 1 silent.
4. Edit a card → set a new price → tag changes to "Edited by you".
5. Hold on an in-stock card → first name + time → "Held for … until …"
   within ~15 s.
6. Wait ~75 s → silent card shows Nudge → tap → it replies.

## Phase 3 notes
- `REPLY_PARSER=agent` (default): each pharmacist message emits
  `pharmacy.message.received`; the per-user automation
  `jobs/parse-pharmacy-reply.md` has the agent read it. Automations are
  installed on the first search (server) and once per browser (UI).
- Verified locally: event → automation dispatch (stops at
  `missing_credentials` here) and the 60 s rules fallback in `get-search`.
- If the automation fails 3× in a row (e.g. no key), the framework pauses
  it. After adding a key, re-enable it in Settings → Automations (or wait
  ~15 min for the scheduler to resume it).

## Manual tests (Phase 3) — need ANTHROPIC_API_KEY
1. Chat: "I need a Ventolin inhaler around Rumuola" → agent confirms
   salbutamol 100mcg (Rx note) → proposes pharmacies → "yes" → board opens.
2. Cards show "Read by Rounds AI · NN%" (not "Read automatically").
3. Kindway (confused persona) asks "which one?" → agent sends one
   clarifying message → Kindway answers "ok inhaler dey, …" → in stock.
4. "Which is cheapest?" → answer matches the board.
5. Click a card, then "Hold this one for Ada till 6pm" → Held ribbon.
6. "I need tramadol" → kind refusal. "My son can't breathe" → 112 first.
