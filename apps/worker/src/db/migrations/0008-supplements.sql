CREATE TABLE supplements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  dose TEXT NOT NULL CHECK (length(dose) <= 40),
  stopped_at INTEGER CHECK (stopped_at >= 946684800000 AND stopped_at < 4102444800000),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_by TEXT REFERENCES caregivers (id),
  created_at INTEGER NOT NULL CHECK (created_at >= 946684800000 AND created_at < 4102444800000),
  updated_by TEXT REFERENCES caregivers (id),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 946684800000 AND updated_at < 4102444800000)
) STRICT;

INSERT INTO supplements (id, name, dose, version, created_at, updated_at)
SELECT 'b1a6d1e4-0c7e-4d3a-9f2b-5e8c7a6d4f31', 'Vitamin D', '400 IU', 1,
  CAST(unixepoch('subsec') * 1000 AS INTEGER), CAST(unixepoch('subsec') * 1000 AS INTEGER)
FROM household;

CREATE TABLE supplement_logs (
  id TEXT PRIMARY KEY,
  supplement_id TEXT NOT NULL REFERENCES supplements (id),
  occurred_at INTEGER NOT NULL CHECK (occurred_at >= 946684800000 AND occurred_at < 4102444800000),
  local_date TEXT NOT NULL CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  dose TEXT NOT NULL CHECK (length(dose) <= 40),
  version INTEGER NOT NULL CHECK (version >= 1),
  created_by TEXT NOT NULL REFERENCES caregivers (id),
  created_at INTEGER NOT NULL CHECK (created_at >= 946684800000 AND created_at < 4102444800000),
  updated_by TEXT NOT NULL REFERENCES caregivers (id),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 946684800000 AND updated_at < 4102444800000),
  deleted_at INTEGER CHECK (deleted_at >= 946684800000 AND deleted_at < 4102444800000)
) STRICT;

CREATE INDEX supplement_logs_by_date ON supplement_logs (local_date, supplement_id);

CREATE INDEX supplement_logs_by_time ON supplement_logs (occurred_at);
