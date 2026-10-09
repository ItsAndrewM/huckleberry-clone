CREATE TABLE household (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE caregivers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE child (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('female', 'male')),
  gestational_age_days INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE receipts (
  action_id TEXT PRIMARY KEY,
  caregiver_id TEXT NOT NULL REFERENCES caregivers (id),
  request_hash TEXT NOT NULL,
  response TEXT NOT NULL,
  changed TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX receipts_by_created_at ON receipts (created_at);
