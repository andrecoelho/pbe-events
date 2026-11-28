-- Event tags and archiving (#72). Tags are free text an event's owners and admins choose (e.g. "Regional",
-- "2027"), shared by everyone on the event, for filtering and sorting the event list. An archived event is hidden
-- from the list unless the Archived filter is on; NULL means not archived.
ALTER TABLE events
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN archived_at TIMESTAMPTZ;
