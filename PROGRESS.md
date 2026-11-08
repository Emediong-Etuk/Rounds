# Rounds — progress log

## Status
- [x] Phase 0: scaffold + spikes
- [ ] Phase 1: data + seed
- [ ] Phase 2: search, board, virtual pharmacies
- [ ] Phase 3: agent
- [ ] Phase 4: public reply link
- [ ] Phase 5: Telegram
- [ ] Phase 6: stock memory + polish
- [ ] Phase 7: watch mode (stretch)
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
