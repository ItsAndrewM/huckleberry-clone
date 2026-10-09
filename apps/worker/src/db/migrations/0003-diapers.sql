CREATE TABLE diapers (
  id TEXT PRIMARY KEY,
  occurred_at INTEGER NOT NULL,
  wet INTEGER NOT NULL CHECK (wet IN (0, 1)),
  dirty INTEGER NOT NULL CHECK (dirty IN (0, 1)),
  version INTEGER NOT NULL CHECK (version >= 1),
  source TEXT NOT NULL CHECK (source IN ('app', 'import')),
  source_ref TEXT,
  created_by TEXT NOT NULL REFERENCES caregivers (id),
  created_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES caregivers (id),
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (wet = 1 OR dirty = 1),
  CHECK ((source = 'import') = (source_ref IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX diapers_by_source_ref ON diapers (source, source_ref) WHERE source = 'import';

CREATE INDEX diapers_by_occurred_at ON diapers (occurred_at);
