DROP TABLE IF EXISTS answers CASCADE;
DROP TABLE IF EXISTS slides CASCADE;
DROP TABLE IF EXISTS translations CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS languages CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS runs CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title_remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permissions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_id)
);

CREATE TABLE languages (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (code, event_id)
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  language_id TEXT REFERENCES languages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, name)
);

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL,
  -- PG = Points General, PS = Points Specific, TF = True/False, FB = Fill in the Blank
  type TEXT NOT NULL CHECK (type IN ('PG', 'PS', 'TF', 'FB')),
  max_points NUMERIC NOT NULL,
  seconds NUMERIC NOT NULL CHECK (seconds = FLOOR(seconds)),
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, number)
);

CREATE TABLE translations (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  answer TEXT NOT NULL,
  clarification TEXT,
  language_id TEXT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (language_id, question_id)
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
  grace_period INTEGER NOT NULL DEFAULT 2, -- in seconds
  started_at TIMESTAMPTZ,
  has_timer BOOLEAN NOT NULL DEFAULT true,
  active_question_id TEXT REFERENCES questions(id) ON DELETE SET NULL,
  question_start_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Only one active run per event
CREATE UNIQUE INDEX unique_active_per_event ON runs (event_id) WHERE status IN ('not_started', 'in_progress');

CREATE TABLE slides (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, number)
);

CREATE TABLE answers (
  id TEXT PRIMARY KEY,
  answer TEXT NOT NULL,
  auto_points_awarded NUMERIC,
  points_awarded NUMERIC,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  translation_id TEXT NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (run_id, team_id)
);

INSERT INTO roles (id, name) VALUES ('owner', 'Owner');
INSERT INTO roles (id, name) VALUES ('admin', 'Admin');
INSERT INTO roles (id, name) VALUES ('judge', 'Judge');
