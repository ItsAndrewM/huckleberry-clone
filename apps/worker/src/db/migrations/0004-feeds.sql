CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  started_at INTEGER NOT NULL CHECK (started_at >= 946684800000 AND started_at < 4102444800000),
  ended_at INTEGER CHECK (ended_at >= 946684800000 AND ended_at < 4102444800000),
  version INTEGER NOT NULL CHECK (version >= 1),
  source TEXT NOT NULL CHECK (source IN ('app', 'import')),
  source_ref TEXT,
  created_by TEXT NOT NULL REFERENCES caregivers (id),
  created_at INTEGER NOT NULL CHECK (created_at >= 946684800000 AND created_at < 4102444800000),
  updated_by TEXT NOT NULL REFERENCES caregivers (id),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 946684800000 AND updated_at < 4102444800000),
  deleted_at INTEGER CHECK (deleted_at >= 946684800000 AND deleted_at < 4102444800000),
  CHECK (ended_at >= started_at),
  CHECK (status = 'active' OR ended_at IS NOT NULL),
  CHECK ((source = 'import') = (source_ref IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX feeds_by_source_ref ON feeds (source, source_ref) WHERE source = 'import';

CREATE UNIQUE INDEX feeds_one_active ON feeds (status) WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX feeds_by_time ON feeds (started_at, ended_at);

CREATE TABLE nursing_segments (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds (id),
  side TEXT NOT NULL CHECK (side IN ('left', 'right')),
  started_at INTEGER NOT NULL CHECK (started_at >= 946684800000 AND started_at < 4102444800000),
  ended_at INTEGER CHECK (ended_at >= 946684800000 AND ended_at < 4102444800000),
  source TEXT NOT NULL CHECK (source IN ('app', 'import')),
  source_ref TEXT,
  created_by TEXT NOT NULL REFERENCES caregivers (id),
  created_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES caregivers (id),
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (ended_at > started_at),
  CHECK ((source = 'import') = (source_ref IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX nursing_segments_by_source_ref ON nursing_segments (source, source_ref) WHERE source = 'import';

CREATE INDEX nursing_segments_by_feed ON nursing_segments (feed_id);

CREATE INDEX nursing_segments_by_time ON nursing_segments (started_at, ended_at);

CREATE TABLE bottle_portions (
  id TEXT PRIMARY KEY,
  feed_id TEXT NOT NULL REFERENCES feeds (id),
  occurred_at INTEGER NOT NULL CHECK (occurred_at >= 946684800000 AND occurred_at < 4102444800000),
  breast_milk_ml REAL NOT NULL CHECK (
    (breast_milk_ml = 0 OR breast_milk_ml BETWEEN 0.05 AND 500)
    AND abs(breast_milk_ml * 10 - round(breast_milk_ml * 10)) < 1e-9
  ),
  formula_ml REAL NOT NULL CHECK (
    (formula_ml = 0 OR formula_ml BETWEEN 0.05 AND 500)
    AND abs(formula_ml * 10 - round(formula_ml * 10)) < 1e-9
  ),
  source TEXT NOT NULL CHECK (source IN ('app', 'import')),
  source_ref TEXT,
  created_by TEXT NOT NULL REFERENCES caregivers (id),
  created_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL REFERENCES caregivers (id),
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (breast_milk_ml + formula_ml > 0),
  CHECK ((source = 'import') = (source_ref IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX bottle_portions_by_source_ref ON bottle_portions (source, source_ref) WHERE source = 'import';

CREATE INDEX bottle_portions_by_feed ON bottle_portions (feed_id);

CREATE INDEX bottle_portions_by_occurred_at ON bottle_portions (occurred_at);
