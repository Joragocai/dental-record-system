ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_status_allowed;

UPDATE appointments
SET status = CASE status
  WHEN 'Scheduled' THEN 'confirmed'
  WHEN 'Completed' THEN 'completed'
  WHEN 'Cancelled' THEN 'cancelled_by_clinic'
  WHEN 'No-show' THEN 'no_show'
  ELSE status
END
WHERE status IN ('Scheduled', 'Completed', 'Cancelled', 'No-show');

ALTER TABLE appointments
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS dentist_user_id UUID,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS rescheduled_from_appointment_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_status_allowed'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_status_allowed CHECK (
        status IN (
          'requested',
          'pending_confirmation',
          'confirmed',
          'checked_in',
          'in_progress',
          'completed',
          'cancelled_by_patient',
          'cancelled_by_clinic',
          'no_show',
          'rescheduled'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_dentist_user_id_fkey'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_dentist_user_id_fkey
      FOREIGN KEY (dentist_user_id) REFERENCES app_users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_rescheduled_from_appointment_id_fkey'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_rescheduled_from_appointment_id_fkey
      FOREIGN KEY (rescheduled_from_appointment_id) REFERENCES appointments(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_duration_minutes_valid'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_duration_minutes_valid CHECK (
        duration_minutes IS NULL OR (duration_minutes >= 1 AND duration_minutes <= 1440)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'appointments_reschedule_not_self'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_reschedule_not_self CHECK (
        rescheduled_from_appointment_id IS NULL OR rescheduled_from_appointment_id <> id
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_rescheduled_from_unique
  ON appointments (rescheduled_from_appointment_id)
  WHERE rescheduled_from_appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_active_dentist_schedule_idx
  ON appointments (dentist_user_id, appointment_date, appointment_time)
  WHERE dentist_user_id IS NOT NULL
    AND status IN ('confirmed', 'checked_in', 'in_progress');

CREATE INDEX IF NOT EXISTS appointments_branch_status_date_idx
  ON appointments (branch_id, status, appointment_date, appointment_time);

CREATE TABLE IF NOT EXISTS appointment_history (
  id UUID PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  previous_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  new_branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  previous_dentist_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  new_dentist_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  previous_appointment_date DATE,
  new_appointment_date DATE,
  previous_appointment_time TIME,
  new_appointment_time TIME,
  previous_duration_minutes INTEGER,
  new_duration_minutes INTEGER,
  reason TEXT,
  related_appointment_id UUID REFERENCES appointments(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  request_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT appointment_history_action_not_blank CHECK (length(trim(action)) > 0),
  CONSTRAINT appointment_history_previous_status_allowed CHECK (
    previous_status IS NULL OR previous_status IN (
      'requested',
      'pending_confirmation',
      'confirmed',
      'checked_in',
      'in_progress',
      'completed',
      'cancelled_by_patient',
      'cancelled_by_clinic',
      'no_show',
      'rescheduled'
    )
  ),
  CONSTRAINT appointment_history_new_status_allowed CHECK (
    new_status IS NULL OR new_status IN (
      'requested',
      'pending_confirmation',
      'confirmed',
      'checked_in',
      'in_progress',
      'completed',
      'cancelled_by_patient',
      'cancelled_by_clinic',
      'no_show',
      'rescheduled'
    )
  ),
  CONSTRAINT appointment_history_previous_duration_valid CHECK (
    previous_duration_minutes IS NULL
    OR (previous_duration_minutes >= 1 AND previous_duration_minutes <= 1440)
  ),
  CONSTRAINT appointment_history_new_duration_valid CHECK (
    new_duration_minutes IS NULL
    OR (new_duration_minutes >= 1 AND new_duration_minutes <= 1440)
  ),
  CONSTRAINT appointment_history_reason_not_blank CHECK (
    reason IS NULL OR length(trim(reason)) > 0
  ),
  CONSTRAINT appointment_history_related_not_self CHECK (
    related_appointment_id IS NULL OR related_appointment_id <> appointment_id
  )
);

CREATE INDEX IF NOT EXISTS appointment_history_appointment_time_idx
  ON appointment_history (appointment_id, occurred_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS appointment_history_request_time_idx
  ON appointment_history (request_id, occurred_at DESC)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointment_history_actor_time_idx
  ON appointment_history (actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_appointment_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'appointment_history is append-only';
END;
$$;

DROP TRIGGER IF EXISTS appointment_history_append_only ON appointment_history;
CREATE TRIGGER appointment_history_append_only
BEFORE UPDATE OR DELETE ON appointment_history
FOR EACH ROW
EXECUTE FUNCTION reject_appointment_history_mutation();

INSERT INTO permissions (id, code, name, description, scope, created_at, updated_at)
VALUES
  ('20000000-0000-4000-8000-000000000019', 'appointment.list', 'List Appointments', 'List appointments for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000020', 'appointment.read', 'Read Appointments', 'Read appointment details for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000021', 'appointment.patient_lookup', 'Lookup Appointment Patients', 'Lookup minimal clinic-wide patient identity for scheduling in an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000022', 'appointment.create', 'Create Appointments', 'Create appointments for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000023', 'appointment.update', 'Update Appointments', 'Update permitted appointment details for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000024', 'appointment.confirm', 'Confirm Appointments', 'Confirm appointment slots for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000025', 'appointment.reschedule', 'Reschedule Appointments', 'Reschedule appointments for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000026', 'appointment.cancel', 'Cancel Appointments', 'Cancel appointments for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000027', 'appointment.check_in', 'Check In Appointments', 'Record patient check-in for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000028', 'appointment.start', 'Start Appointments', 'Mark an appointment in progress for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000029', 'appointment.complete', 'Complete Appointments', 'Complete appointments for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000030', 'appointment.no_show', 'Record Appointment No-show', 'Record a no-show outcome for an allowed branch.', 'BRANCH', NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    updated_at = EXCLUDED.updated_at;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.code LIKE 'appointment.%'
  AND NOT (
    (r.code = 'PERSONNEL' AND p.code IN (
      'appointment.list',
      'appointment.read',
      'appointment.patient_lookup',
      'appointment.create',
      'appointment.update',
      'appointment.confirm',
      'appointment.reschedule',
      'appointment.cancel',
      'appointment.check_in',
      'appointment.complete',
      'appointment.no_show'
    ))
    OR
    (r.code = 'DENTIST' AND p.code IN (
      'appointment.list',
      'appointment.read',
      'appointment.patient_lookup',
      'appointment.create',
      'appointment.update',
      'appointment.confirm',
      'appointment.reschedule',
      'appointment.cancel',
      'appointment.check_in',
      'appointment.start',
      'appointment.complete',
      'appointment.no_show'
    ))
  );

INSERT INTO role_permissions (role_id, permission_id, granted_at)
SELECT r.id, p.id, NOW()
FROM roles r
JOIN permissions p ON (
  (r.code = 'PERSONNEL' AND p.code IN (
    'appointment.list',
    'appointment.read',
    'appointment.patient_lookup',
    'appointment.create',
    'appointment.update',
    'appointment.confirm',
    'appointment.reschedule',
    'appointment.cancel',
    'appointment.check_in',
    'appointment.complete',
    'appointment.no_show'
  ))
  OR
  (r.code = 'DENTIST' AND p.code IN (
    'appointment.list',
    'appointment.read',
    'appointment.patient_lookup',
    'appointment.create',
    'appointment.update',
    'appointment.confirm',
    'appointment.reschedule',
    'appointment.cancel',
    'appointment.check_in',
    'appointment.start',
    'appointment.complete',
    'appointment.no_show'
  ))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
