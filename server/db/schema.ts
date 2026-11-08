import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  pgTable,
  real,
  text,
} from "drizzle-orm/pg-core";

// Times are epoch milliseconds (BIGINT). Money is whole naira (INTEGER).

const ms = (name: string) => bigint(name, { mode: "number" });

// ── Reference data (shared, no user data; read through actions only) ──────

export const areas = pgTable("areas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
});

export const drugs = pgTable("drugs", {
  id: text("id").primaryKey(),
  genericName: text("generic_name").notNull(),
  strength: text("strength"),
  form: text("form").notNull(),
  brandNames: text("brand_names").notNull().default("[]"), // JSON string[]
  aliases: text("aliases").notNull().default("[]"), // JSON string[]
  rxRequired: boolean("rx_required").notNull().default(true),
  controlled: boolean("controlled").notNull().default(false),
  drugKey: text("drug_key").notNull().unique(),
});

export const pharmacies = pgTable("pharmacies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  areaId: text("area_id").notNull(),
  city: text("city").notNull(),
  address: text("address").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  phone: text("phone"),
  telegramChatId: text("telegram_chat_id"),
  telegramUsername: text("telegram_username"),
  connectCode: text("connect_code").notNull().unique(),
  connectedAt: ms("connected_at"),
  isVirtual: boolean("is_virtual").notNull().default(false),
  virtualPersona: text("virtual_persona"),
  createdAt: ms("created_at").notNull(),
});

/** Global stock memory: what a pharmacy said about a drug, and when. */
export const stockObservations = pgTable("stock_observations", {
  id: text("id").primaryKey(),
  pharmacyId: text("pharmacy_id").notNull(),
  drugKey: text("drug_key").notNull(),
  drugLabel: text("drug_label").notNull(),
  availability: text("availability").notNull(),
  priceNaira: integer("price_naira"),
  observedAt: ms("observed_at").notNull(),
  source: text("source").notNull(),
});

/** Telegram webhook idempotency. */
export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  receivedAt: ms("received_at").notNull(),
});

// ── User-owned data (private to owner_email) ────────────────────────────────

export const searches = pgTable("searches", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  rawQuery: text("raw_query").notNull(),
  drugId: text("drug_id"),
  drugKey: text("drug_key").notNull(),
  drugLabel: text("drug_label").notNull(),
  genericName: text("generic_name").notNull(),
  strength: text("strength"),
  form: text("form"),
  brandNames: text("brand_names").notNull().default("[]"),
  rxRequired: boolean("rx_required").notNull().default(false),
  acceptEquivalents: boolean("accept_equivalents").notNull().default(true),
  areaLabel: text("area_label").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  radiusKm: real("radius_km").notNull().default(5),
  status: text("status").notNull().default("asking"),
  watch: boolean("watch").notNull().default(false),
  lastWatchRunAt: ms("last_watch_run_at"),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
});

export const asks = pgTable("asks", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  searchId: text("search_id").notNull(),
  pharmacyId: text("pharmacy_id").notNull(),
  replyToken: text("reply_token").notNull().unique(),
  shortCode: text("short_code").notNull().unique(),
  channel: text("channel").notNull(),
  status: text("status").notNull().default("queued"),
  telegramMessageId: text("telegram_message_id"),
  awaiting: text("awaiting"),
  awaitingPromptMessageId: text("awaiting_prompt_message_id"),
  sentAt: ms("sent_at"),
  lastNudgedAt: ms("last_nudged_at"),
  nudgeCount: integer("nudge_count").notNull().default(0),
  agentMessageCount: integer("agent_message_count").notNull().default(0),
  linkSubmissionCount: integer("link_submission_count").notNull().default(0),
  createdAt: ms("created_at").notNull(),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  askId: text("ask_id").notNull(),
  pharmacyId: text("pharmacy_id").notNull(),
  direction: text("direction").notNull(), // in | out
  channel: text("channel").notNull(), // telegram | link | virtual | system
  text: text("text").notNull(),
  telegramMessageId: text("telegram_message_id"),
  processed: boolean("processed").notNull().default(false),
  processedAt: ms("processed_at"),
  createdAt: ms("created_at").notNull(),
});

/** Append-only. The latest reply per ask is its current state. */
export const replies = pgTable("replies", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  askId: text("ask_id").notNull(),
  pharmacyId: text("pharmacy_id").notNull(),
  availability: text("availability").notNull(),
  priceNaira: integer("price_naira"),
  quantity: integer("quantity"),
  alternativeText: text("alternative_text"),
  restockEta: text("restock_eta"),
  rawText: text("raw_text"),
  source: text("source").notNull(),
  sourceMessageId: text("source_message_id").unique(),
  confidence: real("confidence"),
  createdAt: ms("created_at").notNull(),
});

export const holds = pgTable("holds", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  askId: text("ask_id").notNull(),
  pharmacyId: text("pharmacy_id").notNull(),
  customerFirstName: text("customer_first_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  holdUntil: ms("hold_until").notNull(),
  status: text("status").notNull().default("requested"),
  shortCode: text("short_code").notNull().unique(),
  telegramMessageId: text("telegram_message_id"),
  createdAt: ms("created_at").notNull(),
  updatedAt: ms("updated_at").notNull(),
});
