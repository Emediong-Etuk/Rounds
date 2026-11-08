import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "rounds-initial",
      sql: `CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS drugs (
  id TEXT PRIMARY KEY,
  generic_name TEXT NOT NULL,
  strength TEXT,
  form TEXT NOT NULL,
  brand_names TEXT NOT NULL DEFAULT '[]',
  aliases TEXT NOT NULL DEFAULT '[]',
  rx_required BOOLEAN NOT NULL DEFAULT true,
  controlled BOOLEAN NOT NULL DEFAULT false,
  drug_key TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS pharmacies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area_id TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  phone TEXT,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  connect_code TEXT NOT NULL UNIQUE,
  connected_at BIGINT,
  is_virtual BOOLEAN NOT NULL DEFAULT false,
  virtual_persona TEXT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_observations (
  id TEXT PRIMARY KEY,
  pharmacy_id TEXT NOT NULL,
  drug_key TEXT NOT NULL,
  drug_label TEXT NOT NULL,
  availability TEXT NOT NULL,
  price_naira INTEGER,
  observed_at BIGINT NOT NULL,
  source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id BIGINT PRIMARY KEY,
  received_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS searches (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  raw_query TEXT NOT NULL,
  drug_id TEXT,
  drug_key TEXT NOT NULL,
  drug_label TEXT NOT NULL,
  generic_name TEXT NOT NULL,
  strength TEXT,
  form TEXT,
  brand_names TEXT NOT NULL DEFAULT '[]',
  rx_required BOOLEAN NOT NULL DEFAULT false,
  accept_equivalents BOOLEAN NOT NULL DEFAULT true,
  area_label TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_km REAL NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'asking' CHECK (status IN ('asking','done','cancelled')),
  watch BOOLEAN NOT NULL DEFAULT false,
  last_watch_run_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS asks (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  search_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  reply_token TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  telegram_message_id TEXT,
  awaiting TEXT,
  awaiting_prompt_message_id TEXT,
  sent_at BIGINT,
  last_nudged_at BIGINT,
  nudge_count INTEGER NOT NULL DEFAULT 0,
  agent_message_count INTEGER NOT NULL DEFAULT 0,
  link_submission_count INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  UNIQUE (search_id, pharmacy_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  ask_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  channel TEXT NOT NULL,
  text TEXT NOT NULL,
  telegram_message_id TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS replies (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  ask_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  availability TEXT NOT NULL CHECK (availability IN ('in_stock','out_of_stock','alternative','unclear')),
  price_naira INTEGER,
  quantity INTEGER,
  alternative_text TEXT,
  restock_eta TEXT,
  raw_text TEXT,
  source TEXT NOT NULL,
  source_message_id TEXT UNIQUE,
  confidence REAL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS holds (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  ask_id TEXT NOT NULL,
  pharmacy_id TEXT NOT NULL,
  customer_first_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  hold_until BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','declined','cancelled','expired')),
  short_code TEXT NOT NULL UNIQUE,
  telegram_message_id TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS pharmacies_area_idx ON pharmacies (area_id);
CREATE INDEX IF NOT EXISTS pharmacies_chat_idx ON pharmacies (telegram_chat_id);
CREATE INDEX IF NOT EXISTS stock_obs_drug_idx ON stock_observations (drug_key, pharmacy_id, observed_at);
CREATE INDEX IF NOT EXISTS searches_owner_idx ON searches (owner_email, created_at);
CREATE INDEX IF NOT EXISTS searches_watch_idx ON searches (owner_email, watch);
CREATE INDEX IF NOT EXISTS asks_search_idx ON asks (search_id);
CREATE INDEX IF NOT EXISTS asks_pharmacy_idx ON asks (pharmacy_id, created_at);
CREATE INDEX IF NOT EXISTS messages_ask_idx ON messages (ask_id, created_at);
CREATE INDEX IF NOT EXISTS messages_unprocessed_idx ON messages (processed, direction, created_at);
CREATE INDEX IF NOT EXISTS replies_ask_idx ON replies (ask_id, created_at);
CREATE INDEX IF NOT EXISTS holds_ask_idx ON holds (ask_id, created_at)`,
    },
  ],
  { table: "rounds_migrations" },
);
