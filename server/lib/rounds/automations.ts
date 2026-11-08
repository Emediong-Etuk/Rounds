import { resourceGetByPath, resourcePut } from "@agent-native/core/resources";

// Per-user automation resources. Bump the version tag to rewrite them.
const VERSION = "rounds-v1";

const PARSE_REPLY = `---
schedule: ""
enabled: true
triggerType: event
event: pharmacy.message.received
condition: ""
mode: agentic
domain: rounds
runAs: creator
---
<!-- ${VERSION} -->
A pharmacist sent a message about a Rounds stock request. The payload has: messageId, askId (may be null), candidateAskIds, pharmacyId, pharmacyName, text.
1. If askId is set, call get-ask for it. Otherwise call get-ask for each candidate and pick the one the message is clearly about. If you can't tell, call message-pharmacy on the most recent candidate asking which medicine they mean, and stop.
2. Follow "Reading pharmacist replies" in AGENTS.md exactly.
3. Call record-reply with source "agent", sourceMessageId = messageId, a confidence, and notifyPharmacy: true. Or, if unclear, record-reply with availability "unclear" (sourceMessageId = messageId) and send ONE clarifying question with message-pharmacy.
Never invent prices or availability. Do not message the user; the board updates by itself.
`;

const WATCH = `---
schedule: "0 */3 * * *"
enabled: true
runAs: creator
domain: rounds
---
<!-- ${VERSION} -->
Call list-watched-searches. For each watched search with no in-stock reply yet, call re-ask-out-of-stock. If any pharmacy now has it in stock, switch watch off with update-search and leave a short summary.
`;

export const AUTOMATIONS: Array<{ path: string; content: string }> = [
  { path: "jobs/parse-pharmacy-reply.md", content: PARSE_REPLY },
  { path: "jobs/rounds-watch.md", content: WATCH },
];

/** Idempotent. Keeps a user's enabled/disabled choice unless the version changed. */
export async function installRoundsAutomations(ownerEmail: string) {
  const results: Array<{ path: string; status: "created" | "updated" | "unchanged" }> = [];
  for (const a of AUTOMATIONS) {
    const existing = await resourceGetByPath(ownerEmail, a.path);
    if (!existing) {
      await resourcePut(ownerEmail, a.path, a.content);
      results.push({ path: a.path, status: "created" });
    } else if (!existing.content.includes(VERSION)) {
      await resourcePut(ownerEmail, a.path, a.content);
      results.push({ path: a.path, status: "updated" });
    } else {
      results.push({ path: a.path, status: "unchanged" });
    }
  }
  return results;
}

const installed = new Set<string>();
/** Cheap per-process guard so hot paths can call this freely. */
export async function ensureRoundsAutomations(ownerEmail: string) {
  if (installed.has(ownerEmail)) return;
  await installRoundsAutomations(ownerEmail);
  installed.add(ownerEmail);
}
