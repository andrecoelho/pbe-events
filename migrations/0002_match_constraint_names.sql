-- Production was built with manual changes before migrations existed. Its constraints work the same as
-- 0001_init.sql but two have different names and there is one redundant foreign key. Bring them in line
-- so later migrations can refer to constraints by name. Where the names already match (staging, fresh
-- databases) this changes nothing.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'languages'::regclass AND conname = 'languages_event_id_id_unique'
  ) THEN
    -- Also renames the index behind the constraint.
    ALTER TABLE languages RENAME CONSTRAINT languages_event_id_id_unique TO languages_event_id_id_key;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'teams'::regclass AND conname = 'teams_event_language_fkey'
  ) THEN
    ALTER TABLE teams RENAME CONSTRAINT teams_event_language_fkey TO teams_event_id_language_id_fkey;
  END IF;
END $$;

-- Redundant: teams_event_id_language_id_fkey already ties a team's language to a language of its event.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_language_id_fkey;
