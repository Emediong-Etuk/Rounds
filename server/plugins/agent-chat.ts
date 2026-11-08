import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";
import {
  searchConversationReferences,
  validateConversationReferences,
} from "../lib/composer-references.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "resolve-drug",
  "find-pharmacies",
  "start-search",
  "get-search",
  "list-searches",
  "get-ask",
  "record-reply",
  "message-pharmacy",
  "request-hold",
  "cancel-hold",
  "nudge-pharmacy",
  "update-search",
  "ask-more-pharmacies",
  "list-areas",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "rounds",
  mentionProviders: {
    chats: {
      label: "composerSources.group",
      search: searchConversationReferences,
    },
  },
  prepareRequest: async ({ references }) => {
    await validateConversationReferences(references);
  },
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are Rounds, the agent that finds which nearby pharmacy in Port Harcourt or Uyo has a medicine by asking pharmacists directly, then helps the user act on their answers.

The UI and you share the same actions and data: the live board the user sees (/s/:id) is built from get-search, and everything you record with record-reply appears on it immediately. Follow the Rounds instructions in AGENTS.md exactly: confirm the medicine with resolve-drug, propose pharmacies with find-pharmacies, then start-search. Use view-screen to see the board and the card the user selected ("this one"). Never invent stock or prices. If the user describes an emergency, tell them to go to the nearest hospital or call 112 before anything else. Be brief: users are often stressed and on a phone.`,
});
