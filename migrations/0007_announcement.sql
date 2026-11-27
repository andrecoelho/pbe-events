-- The announcement banner (#62): at most one message, shown at the top of the app and on the sign-in page.
-- The single row is keyed by `id = true`; no row means no announcement.
CREATE TABLE announcement (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  message TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning')),
  -- Hidden from then on; NULL keeps it up until it's cleared.
  ends_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL
);
