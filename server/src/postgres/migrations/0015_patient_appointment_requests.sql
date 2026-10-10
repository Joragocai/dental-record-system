-- Phase 14C: durable patient appointment change requests.
-- Pending requests do not alter appointment status or reserve a Dentist slot.
CREATE TABLE IF NOT EXISTS patient_appointment_requests (
 id UUID PRIMARY KEY,
 patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
 appointment_id UUID REFERENCES appointments(id) ON DELETE RESTRICT,
 requested_by_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_type TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 requested_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
 requested_date DATE,
 requested_time TIME,
 reason TEXT,
 idempotency_key UUID NOT NULL,
 request_fingerprint TEXT NOT NULL,
 reviewed_by_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT patient_appointment_requests_type_valid CHECK(request_type IN ('cancel','reschedule')),
 CONSTRAINT patient_appointment_requests_status_valid CHECK(status IN ('pending','approved','rejected')),
 CONSTRAINT patient_appointment_requests_target_valid CHECK(appointment_id IS NOT NULL),
 CONSTRAINT patient_appointment_requests_schedule_valid CHECK(
 (request_type='cancel' AND requested_branch_id IS NULL AND requested_date IS NULL AND requested_time IS NULL)
 OR (request_type='reschedule' AND requested_branch_id IS NOT NULL AND requested_date IS NOT NULL)),
 CONSTRAINT patient_appointment_requests_review_valid CHECK(
 (status='pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
 OR (status<>'pending' AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)),
 CONSTRAINT patient_appointment_requests_reason_length CHECK(reason IS NULL OR length(reason)<=500),
 CONSTRAINT patient_appointment_requests_idempotent UNIQUE(requested_by_user_id,idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS patient_appointment_single_pending
 ON patient_appointment_requests(appointment_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS patient_appointment_creation_keys (
 requested_by_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 idempotency_key UUID NOT NULL,
 appointment_id UUID NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE RESTRICT,
 request_fingerprint TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (requested_by_user_id,idempotency_key)
);
ALTER TABLE patient_appointment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_appointment_creation_keys ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS patient_appointment_requests_patient_idx
 ON patient_appointment_requests(patient_id,created_at DESC);
