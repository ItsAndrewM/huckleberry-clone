CREATE TABLE sleeps (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('nap', 'night')),
  started_at INTEGER NOT NULL CHECK (started_at >= 946684800000 AND started_at < 4102444800000),
  ended_at INTEGER CHECK (ended_at >= 946684800000 AND ended_at < 4102444800000),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_by TEXT NOT NULL REFERENCES caregivers (id),
  created_at INTEGER NOT NULL CHECK (created_at >= 946684800000 AND created_at < 4102444800000),
  updated_by TEXT NOT NULL REFERENCES caregivers (id),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 946684800000 AND updated_at < 4102444800000),
  deleted_at INTEGER CHECK (deleted_at >= 946684800000 AND deleted_at < 4102444800000),
  CHECK (ended_at > started_at)
) STRICT;

CREATE UNIQUE INDEX sleeps_one_active ON sleeps ((ended_at IS NULL)) WHERE ended_at IS NULL AND deleted_at IS NULL;

CREATE INDEX sleeps_by_time ON sleeps (started_at, ended_at);
