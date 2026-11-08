// All pharmacist-facing copy lives here. Telegram uses HTML parse mode, so
// every dynamic value goes through esc().

import { config } from "./config.js";
import { formatNaira, lagosTime } from "./ranking.js";
import type { InlineButton } from "./telegram.js";

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type AskCopyInput = {
  drugLabel: string;
  brandNames: string[];
  acceptEquivalents: boolean;
  areaLabel: string;
  askedAt: number;
};

export function brandLine(i: Pick<AskCopyInput, "brandNames" | "acceptEquivalents">): string {
  const brands = i.brandNames.slice(0, 3);
  if (i.acceptEquivalents) {
    return brands.length
      ? `Brand: ${brands.join(", ")} or any same-strength equivalent ✅`
      : "Any brand with the same ingredient and strength is fine ✅";
  }
  return brands.length ? `Brand: ${brands.join(" or ")} only` : "Exact product only";
}

export function askMessageHtml(i: AskCopyInput): string {
  return [
    "🔎 <b>Rounds stock check</b>",
    `Do you have <b>${esc(i.drugLabel)}</b>?`,
    esc(brandLine(i)),
    `Customer is near <b>${esc(i.areaLabel.replace(/^near\s+/i, ""))}</b> · asked ${esc(lagosTime(i.askedAt))}`,
    "",
    "Tap a button, or just reply in your own words (e.g. “yes 3500”).",
  ].join("\n");
}

/** Plain-text version for the message log and virtual pharmacies. */
export function askMessageText(i: AskCopyInput): string {
  return `Rounds stock check: do you have ${i.drugLabel}? ${brandLine(i)}. Customer is near ${i.areaLabel.replace(/^near\s+/i, "")}.`;
}

export function replyLinkUrl(token: string): string {
  const base = config.publicBaseUrl;
  return `${base}/r/${encodeURIComponent(token)}`;
}

export function askKeyboard(shortCode: string, replyToken: string): { inline_keyboard: InlineButton[][] } {
  const rows: InlineButton[][] = [
    [
      { text: "✅ In stock", callback_data: `a:${shortCode}:y` },
      { text: "❌ Out", callback_data: `a:${shortCode}:n` },
      { text: "🔁 Alternative", callback_data: `a:${shortCode}:alt` },
    ],
  ];
  // Telegram rejects non-HTTPS URL buttons; only add the link when deployed.
  if (config.publicBaseUrl.startsWith("https://")) {
    rows.push([{ text: "📝 Reply with price →", url: replyLinkUrl(replyToken) }]);
  }
  return { inline_keyboard: rows };
}

export function ackText(r: {
  availability: string;
  priceNaira?: number | null | undefined;
  restockEta?: string | null | undefined;
  alternativeText?: string | null | undefined;
}): string {
  const parts: string[] = [];
  if (r.availability === "in_stock") parts.push("In stock");
  else if (r.availability === "out_of_stock") parts.push("Out of stock");
  else if (r.availability === "alternative") parts.push(`Alternative${r.alternativeText ? `: ${r.alternativeText}` : ""}`);
  else parts.push("Got your message");
  if (r.priceNaira) parts.push(formatNaira(r.priceNaira));
  if (r.restockEta) parts.push(`back ${r.restockEta}`);
  return `👍 Noted: ${parts.join(", ")}. Thank you!`;
}

export function holdRequestHtml(i: {
  quantity: number;
  drugLabel: string;
  firstName: string;
  holdUntil: number;
}): string {
  return [
    "📌 <b>Hold request</b>",
    `<b>${i.quantity} × ${esc(i.drugLabel)}</b> for <b>${esc(i.firstName)}</b>, until <b>${esc(lagosTime(i.holdUntil))}</b> today.`,
    "Can you set it aside?",
  ].join("\n");
}

export function holdKeyboard(holdShortCode: string): { inline_keyboard: InlineButton[][] } {
  return {
    inline_keyboard: [
      [
        { text: "✅ I'll hold it", callback_data: `h:${holdShortCode}:ok` },
        { text: "❌ Can't", callback_data: `h:${holdShortCode}:no` },
      ],
    ],
  };
}

export const COPY = {
  connected: (name: string, area: string) =>
    `✅ You're connected to Rounds as <b>${esc(name)}, ${esc(area)}</b>.\nCustomers nearby will ask if you have a medicine in stock. Tap a button or reply in your own words. It takes 5 seconds.`,
  badConnectCode: "That link didn't work. Ask the Rounds team for a new one.",
  unknownChat: "Hi! 👋 This bot is for pharmacies on Rounds. Ask the Rounds team for your connect link.",
  textOnly: "I can read text replies only for now 🙏",
  askPrice: "What's the price in ₦? Reply with a number, or 'skip'.",
  askRestock: "Any idea when it'll be back? (e.g. 'Thursday'; or ignore)",
  askAlternative: "What do you have instead? Name, strength and price.",
  nudge: (drugLabel: string) =>
    `⏰ Quick reminder: do you have <b>${esc(drugLabel)}</b>? Tap a button above or just reply. Thank you!`,
  holdCancelled: (drugLabel: string, firstName: string) =>
    `Hold cancelled: ${esc(drugLabel)} for ${esc(firstName)}. You don't need to keep it aside. Thank you!`,
  noOpenAsk: "Thanks! I couldn't match that to an open request. Reply to the request message directly so I know which one it is.",
};
