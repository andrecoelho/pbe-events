-- Admin actions (#61): who did what, when. No foreign keys, so entries outlive the users and events they name;
-- the email and event name are copied in for that reason. Ids are UUIDv7, so they sort by time.
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  -- e.g. 'event.reset', 'team.release_device'
  action TEXT NOT NULL,
  event_id TEXT,
  event_name TEXT,
  details JSONB NOT NULL DEFAULT '{}'
);
