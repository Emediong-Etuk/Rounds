import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no 0/o/1/l

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomString(12)}`;
}

/** Short code for Telegram callback_data (64-byte limit). */
export function newShortCode(): string {
  return randomString(8);
}

/** Unguessable reply-link token: 24 random bytes = 192 bits, base64url. */
export function newReplyToken(): string {
  return randomBytes(24).toString("base64url");
}
