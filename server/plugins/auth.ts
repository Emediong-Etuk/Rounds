import { createToolkitAuthPlugin } from "@agent-native/toolkit/app/auth/server";

export default createToolkitAuthPlugin({
  workspaceAppPublicPaths: ["/"],
  rootAuth: true,
  marketing: false,
  // Pharmacists never sign in: the Telegram webhook verifies its own secret
  // header and the reply link uses an unguessable per-ask token.
  publicPaths: ["/r", "/api/r", "/api/telegram"],
});
