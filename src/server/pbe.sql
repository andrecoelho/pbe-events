DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS questions_info;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS teams;
DROP TABLE IF EXISTS languages;
DROP TABLE IF EXISTS user_events;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id TEXT NOT NULL,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (email)
);

CREATE TABLE sessions (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE events (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE roles (
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE user_events (
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE TABLE languages (
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE teams (
  id TEXT NOT NULL,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE questions (
  id TEXT NOT NULL,
  -- PS = Points Specific, PW = Points per Word, TF = True/False, FB = Fill in the Blank
  type TEXT NOT NULL CHECK (type IN ('PS', 'PW', 'TF', 'FB')),
  max_points NUMERIC NOT NULL,
  seconds NUMERIC NOT NULL,
  event_id TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE questions_info (
  id TEXT NOT NULL,
  body TEXT NOT NULL,
  answer TEXT NOT NULL,
  language_code TEXT NOT NULL,
  question_id TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (language_code) REFERENCES languages(code) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE answers (
  id TEXT NOT NULL,
  answer TEXT NOT NULL,
  auto_points_awarded NUMERIC
  points_awarded NUMERIC,
  team_id TEXT NOT NULL,
  question_info_id TEXT NOT NULL,
  created_at NUMERIC NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (question_info_id) REFERENCES questions_info(id) ON DELETE CASCADE
);
