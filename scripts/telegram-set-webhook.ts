// Usage: pnpm tsx scripts/telegram-set-webhook.ts
// Reads ROUNDS_TELEGRAM_BOT_TOKEN, ROUNDS_TELEGRAM_WEBHOOK_SECRET and
// PUBLIC_BASE_URL from the environment (or .env), registers the webhook and
// prints getWebhookInfo. Never prints the token.
function loadDotEnv() {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env; rely on the environment
  }
}

async function main() {
  loadDotEnv();
  const { config } = await import("../server/lib/rounds/config.js");
  const tg = await import("../server/lib/rounds/telegram.js");
  const base = config.publicBaseUrl;
  const secret = config.telegramWebhookSecret;
  if (!config.telegramBotToken) throw new Error("Set ROUNDS_TELEGRAM_BOT_TOKEN");
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    throw new Error("Set ROUNDS_TELEGRAM_WEBHOOK_SECRET (32+ chars, A-Z a-z 0-9 _ - only)");
  }
  if (!base.startsWith("https://")) throw new Error("PUBLIC_BASE_URL must be an https:// URL (use a tunnel locally)");
  const url = `${base}/api/telegram/webhook`;
  await tg.setWebhook({
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  console.log(`Webhook set to ${url}`);
  console.log(JSON.stringify(await tg.getWebhookInfo(), null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
