// Deploy-level configuration. These are one-per-deployment values (a single
// Rounds bot), never per-user credentials.

export const config = {
  get demoMode(): boolean {
    // guard:allow-env-credential — deploy-level feature flag, not a credential
    return process.env.DEMO_MODE === "true";
  },
  get replyParser(): "agent" | "rules" {
    // guard:allow-env-credential — deploy-level setting, not a credential
    return process.env.REPLY_PARSER === "rules" ? "rules" : "agent";
  },
  get publicBaseUrl(): string {
    // guard:allow-env-credential — deploy-level public URL, not a credential
    return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
  },
  get telegramBotToken(): string | undefined {
    // guard:allow-env-credential — the single deploy-level Rounds bot token
    return process.env.ROUNDS_TELEGRAM_BOT_TOKEN || undefined;
  },
  get telegramBotUsername(): string | undefined {
    // guard:allow-env-credential — public bot username for deep links
    return process.env.ROUNDS_TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || undefined;
  },
  get telegramWebhookSecret(): string | undefined {
    // guard:allow-env-credential — deploy-level webhook verification secret
    return process.env.ROUNDS_TELEGRAM_WEBHOOK_SECRET || undefined;
  },
};

export const SILENT_AFTER_MS = 15 * 60 * 1000;
/** Demo pharmacies go "silent" sooner so the Nudge button shows during a demo. */
export const VIRTUAL_SILENT_AFTER_MS = 75 * 1000;
export const UNPROCESSED_FALLBACK_MS = 60 * 1000;
export const OPEN_ASK_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REPLY_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_LINK_SUBMISSIONS = 10;
