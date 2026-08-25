CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  appointment_date DATE NOT NULL,
  appointment_time TIME,
  planned_procedure TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT appointments_status_allowed CHECK (
    status IN ('Scheduled', 'Completed', 'Cancelled', 'No-show')
  ),
  CONSTRAINT appointments_planned_procedure_not_blank CHECK (
    planned_procedure IS NULL OR length(trim(planned_procedure)) > 0
  ),
  CONSTRAINT appointments_notes_not_blank CHECK (
    notes IS NULL OR length(trim(notes)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_branch_date ON appointments (branch_id, appointment_date, appointment_time);

CREATE TABLE IF NOT EXISTS legacy_appointment_identity_map (
  source_system TEXT NOT NULL,
  legacy_appointment_row_id BIGINT NOT NULL,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (source_system, legacy_appointment_row_id),
  CONSTRAINT legacy_appointment_identity_map_appointment_unique UNIQUE (appointment_id),
  CONSTRAINT legacy_appointment_identity_map_source_system_not_blank CHECK (length(trim(source_system)) > 0)
);
