-- Adds payment support to an existing database. schema.sql's CREATE TABLE IF
-- NOT EXISTS can't add columns to a table that already exists, so this is a
-- separate, explicit migration - run once per environment.
ALTER TABLE subscribers ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  gateway TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  created_at TEXT NOT NULL,
  paid_at TEXT,
  raw_webhook TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_external_id ON payments(gateway, external_id);
