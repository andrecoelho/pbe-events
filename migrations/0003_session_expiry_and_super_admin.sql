-- Sessions expire after 30 days without use (#18); getSession renews them as they're used.
-- Existing sessions get 30 days from now.
ALTER TABLE sessions ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days');

-- Super admins can use the admin page (Phase 3). Set by hand in the database.
ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT false;
