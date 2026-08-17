CREATE TABLE IF NOT EXISTS treatment_code_counters (
  calendar_year INTEGER PRIMARY KEY,
  last_sequence INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT treatment_code_counters_calendar_year_valid CHECK (calendar_year >= 2000),
  CONSTRAINT treatment_code_counters_last_sequence_positive CHECK (last_sequence >= 1)
);

CREATE TABLE IF NOT EXISTS treatments (
  id UUID PRIMARY KEY,
  treatment_code TEXT NOT NULL UNIQUE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  treatment_date DATE NOT NULL,
  tooth_numbers TEXT,
  next_appointment_date DATE,
  next_appointment_time TEXT,
  procedure TEXT NOT NULL,
  dentists TEXT NOT NULL,
  amount_charged NUMERIC(12,2) NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'None',
  discount_percent NUMERIC(5,2) NOT NULL,
  discount_amount NUMERIC(12,2) NOT NULL,
  net_amount_due NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) NOT NULL,
  balance NUMERIC(12,2) NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT treatments_treatment_code_format CHECK (treatment_code ~ '^T-[0-9]{4}-[0-9]{4}$'),
  CONSTRAINT treatments_treatment_code_not_blank CHECK (length(trim(treatment_code)) > 0),
  CONSTRAINT treatments_procedure_not_blank CHECK (length(trim(procedure)) > 0),
  CONSTRAINT treatments_dentists_not_blank CHECK (length(trim(dentists)) > 0),
  CONSTRAINT treatments_next_appointment_time_format CHECK (
    next_appointment_time IS NULL OR next_appointment_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  ),
  CONSTRAINT treatments_next_appointment_requires_date CHECK (
    next_appointment_time IS NULL OR next_appointment_date IS NOT NULL
  ),
  CONSTRAINT treatments_next_appointment_not_before_treatment_date CHECK (
    next_appointment_date IS NULL OR next_appointment_date >= treatment_date
  ),
  CONSTRAINT treatments_discount_type_allowed CHECK (
    discount_type IN ('None', 'Senior Citizen', 'PWD', 'Senior Citizen/PWD', 'Custom')
  ),
  CONSTRAINT treatments_amount_charged_nonnegative CHECK (amount_charged >= 0),
  CONSTRAINT treatments_discount_percent_range CHECK (discount_percent >= 0 AND discount_percent <= 100),
  CONSTRAINT treatments_discount_amount_nonnegative CHECK (discount_amount >= 0),
  CONSTRAINT treatments_net_amount_due_nonnegative CHECK (net_amount_due >= 0),
  CONSTRAINT treatments_amount_paid_nonnegative CHECK (amount_paid >= 0),
  CONSTRAINT treatments_balance_nonnegative CHECK (balance >= 0),
  CONSTRAINT treatments_amount_paid_not_above_net_due CHECK (amount_paid <= net_amount_due)
);

CREATE INDEX IF NOT EXISTS idx_treatments_patient_id ON treatments (patient_id);
CREATE INDEX IF NOT EXISTS idx_treatments_treatment_date ON treatments (treatment_date DESC, treatment_code DESC);

CREATE TABLE IF NOT EXISTS legacy_treatment_identity_map (
  source_system TEXT NOT NULL,
  legacy_treatment_row_id BIGINT NOT NULL,
  legacy_treatment_code TEXT NOT NULL,
  treatment_id UUID NOT NULL REFERENCES treatments(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (source_system, legacy_treatment_row_id),
  CONSTRAINT legacy_treatment_identity_map_code_unique UNIQUE (source_system, legacy_treatment_code),
  CONSTRAINT legacy_treatment_identity_map_treatment_unique UNIQUE (treatment_id),
  CONSTRAINT legacy_treatment_identity_map_source_system_not_blank CHECK (length(trim(source_system)) > 0),
  CONSTRAINT legacy_treatment_identity_map_code_not_blank CHECK (length(trim(legacy_treatment_code)) > 0)
);
