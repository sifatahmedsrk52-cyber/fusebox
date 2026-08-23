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
  last_checked_at TEXT
);
