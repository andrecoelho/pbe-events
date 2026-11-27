-- User management on the admin page (#58).

-- A disabled account can't sign in; disabling it also ends its sessions.
ALTER TABLE users ADD COLUMN disabled_at TIMESTAMPTZ;

-- One-time password reset links an admin creates for a user. Only the token's SHA-256 (hex) is kept. A new link
-- replaces the user's earlier ones; a used or expired one stops working.
CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
