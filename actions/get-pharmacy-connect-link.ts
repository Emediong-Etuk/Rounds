import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/rounds/auth.js";
import { config } from "../server/lib/rounds/config.js";

export default defineAction({
  description:
    "Get the one-time Telegram connect link (and QR code) a pharmacist taps to link their Telegram to this pharmacy. Bots can only message people who pressed Start, so each pharmacy connects once.",
  schema: z.object({ id: z.string().describe("Pharmacy id") }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }, ctx) => {
    requireUser(ctx);
    const [p] = await getDb().select().from(schema.pharmacies).where(eq(schema.pharmacies.id, id)).limit(1);
    if (!p) fail("Pharmacy not found.", { errorCode: "not_found", statusCode: 404 });
    const bot = config.telegramBotUsername;
    if (!bot) {
      return { deepLink: null, qrDataUrl: null, connectCode: p.connectCode, configured: false, connected: Boolean(p.telegramChatId) };
    }
    const deepLink = `https://t.me/${bot}?start=${encodeURIComponent(p.connectCode)}`;
    const qrDataUrl = await QRCode.toDataURL(deepLink, { margin: 1, width: 320 });
    return { deepLink, qrDataUrl, connectCode: p.connectCode, configured: true, connected: Boolean(p.telegramChatId) };
  },
});
