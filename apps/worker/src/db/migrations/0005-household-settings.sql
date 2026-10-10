ALTER TABLE household ADD COLUMN volume_unit TEXT NOT NULL DEFAULT 'ml' CHECK (volume_unit IN ('ml', 'fl_oz'));

ALTER TABLE household ADD COLUMN weight_unit TEXT NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'g', 'lb_oz'));

ALTER TABLE household ADD COLUMN length_unit TEXT NOT NULL DEFAULT 'cm' CHECK (length_unit IN ('cm', 'in'));

ALTER TABLE household ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);

ALTER TABLE household ADD COLUMN updated_by TEXT REFERENCES caregivers (id);

ALTER TABLE child ADD COLUMN version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1);

ALTER TABLE child ADD COLUMN updated_by TEXT REFERENCES caregivers (id);
