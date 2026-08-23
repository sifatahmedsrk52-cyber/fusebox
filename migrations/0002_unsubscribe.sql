-- Adds an unsubscribe token per subscriber, generated at signup, used in a
-- one-click unsubscribe link in every threshold email's footer.
ALTER TABLE subscribers ADD COLUMN unsubscribe_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscribers_unsubscribe_token ON subscribers(unsubscribe_token);
