ALTER TABLE treatments
  ADD COLUMN IF NOT EXISTS branch_id UUID;

UPDATE treatments t
SET branch_id = p.branch_id
FROM patients p
WHERE t.patient_id = p.id
  AND t.branch_id IS NULL;

ALTER TABLE treatments
  ALTER COLUMN branch_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'treatments_branch_id_fkey'
  ) THEN
    ALTER TABLE treatments
      ADD CONSTRAINT treatments_branch_id_fkey
      FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_treatments_branch_date
  ON treatments (branch_id, treatment_date DESC, treatment_code DESC);
