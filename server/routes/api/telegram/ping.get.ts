import { defineEventHandler } from "h3";

// Public health check for the Telegram webhook path (spike: confirms publicPaths).
export default defineEventHandler(() => ({ ok: true, service: "rounds-telegram" }));
