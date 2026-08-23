CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openai',
  encrypted_key TEXT NOT NULL,     -- base64 AES-GCM ciphertext of the user's OpenAI admin key
  iv TEXT NOT NULL,                -- base64 12-byte IV used for that ciphertext
  ceiling_cents INTEGER NOT NULL,  -- monthly spend ceiling, in cents
  created_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_notified_threshold INTEGER NOT NULL DEFAULT 0,  -- highest of 50/80/100 already emailed this period
  last_notified_period TEXT,        -- 'YYYY-MM' the threshold above applies to; reset when the month rolls over
  last_error TEXT,                  -- most recent fetch/decrypt error, for debugging a stuck row
  last_checked_at TEXT,
  tier TEXT NOT NULL DEFAULT 'free' -- 'free' or 'paid' - flipped by a confirmed payment webhook
);

-- One row per checkout attempt, across whichever payment gateway handled it.
-- Adding a new gateway later (Lemon Squeezy, etc.) never touches this table's
-- shape - it's just a new value in `gateway` and a new implementation in
-- src/payments/.
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id),
  gateway TEXT NOT NULL,            -- 'nowpayments', later 'lemonsqueezy', etc.
  external_id TEXT NOT NULL,        -- the gateway's own id for this checkout/invoice
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'failed' | 'expired'
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  created_at TEXT NOT NULL,
  paid_at TEXT,
  raw_webhook TEXT                  -- last webhook payload received, for debugging
);

CREATE INDEX IF NOT EXISTS idx_payments_external_id ON payments(gateway, external_id);
