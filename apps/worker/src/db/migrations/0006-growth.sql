CREATE TABLE growth_measurements (
  id TEXT PRIMARY KEY,
  measured_at INTEGER NOT NULL CHECK (measured_at >= 946684800000 AND measured_at < 4102444800000),
  weight_g REAL CHECK (weight_g BETWEEN 200 AND 40000),
  length_cm REAL CHECK (length_cm BETWEEN 20 AND 150),
  head_cm REAL CHECK (head_cm BETWEEN 15 AND 70),
  version INTEGER NOT NULL CHECK (version >= 1),
  source TEXT NOT NULL CHECK (source IN ('app', 'import')),
  source_ref TEXT,
  created_by TEXT NOT NULL REFERENCES caregivers (id),
  created_at INTEGER NOT NULL CHECK (created_at >= 946684800000 AND created_at < 4102444800000),
  updated_by TEXT NOT NULL REFERENCES caregivers (id),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 946684800000 AND updated_at < 4102444800000),
  deleted_at INTEGER CHECK (deleted_at >= 946684800000 AND deleted_at < 4102444800000),
  CHECK (weight_g IS NOT NULL OR length_cm IS NOT NULL OR head_cm IS NOT NULL),
  CHECK ((source = 'import') = (source_ref IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX growth_measurements_by_source_ref ON growth_measurements (source, source_ref) WHERE source = 'import';

CREATE INDEX growth_measurements_by_measured_at ON growth_measurements (measured_at);
