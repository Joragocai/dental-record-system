-- Phase 14A LOCAL DRAFT ONLY. Separate approval is required for any hosted migration.
-- No public patient signup, claim-by-code, or patient data routes are enabled here.
CREATE TABLE IF NOT EXISTS patient_accounts (
  app_user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL UNIQUE REFERENCES patients(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  invitation_state TEXT NOT NULL DEFAULT 'not_sent',
  invitation_started_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT patient_accounts_status_allowed CHECK (status IN ('pending', 'active', 'revoked')),
  CONSTRAINT patient_accounts_state_consistent CHECK (
    (status = 'pending' AND activated_at IS NULL AND revoked_at IS NULL)
    OR (status = 'active' AND activated_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT patient_accounts_invite_state_allowed CHECK (
    invitation_state IN ('not_sent', 'sending', 'sent', 'reconciliation_required')
  ),
  CONSTRAINT patient_accounts_invite_state_consistent CHECK (
    (invitation_state = 'not_sent' AND invitation_started_at IS NULL AND invited_at IS NULL)
    OR (invitation_state IN ('sending', 'reconciliation_required')
      AND invitation_started_at IS NOT NULL AND invited_at IS NULL)
    OR (invitation_state = 'sent'
      AND invitation_started_at IS NOT NULL AND invited_at IS NOT NULL)
  ),
  CONSTRAINT patient_accounts_active_requires_invitation CHECK (
    status <> 'active' OR invitation_state = 'sent'
  ),
  CONSTRAINT patient_accounts_approval_before_create CHECK (approved_at <= created_at),
  CONSTRAINT patient_accounts_update_after_create CHECK (updated_at >= created_at),
  CONSTRAINT patient_accounts_activation_after_create CHECK (activated_at IS NULL OR activated_at >= created_at),
  CONSTRAINT patient_accounts_revocation_after_create CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CONSTRAINT patient_accounts_invitation_after_start CHECK (invited_at IS NULL OR invited_at >= invitation_started_at)
);
CREATE INDEX IF NOT EXISTS patient_accounts_active_patient_idx
  ON patient_accounts (patient_id) WHERE status = 'active';

-- Client-side PostgREST access has no SELECT/INSERT/UPDATE/DELETE policies.
-- Only the server's controlled PostgreSQL connection may manage these links.
ALTER TABLE patient_accounts ENABLE ROW LEVEL SECURITY;

-- Generic authorization remains fail-closed for OWN-scoped permissions.
INSERT INTO permissions (id, code, name, description, scope, created_at, updated_at)
VALUES
 ('20000000-0000-4000-8000-000000000040', 'portal.profile.read', 'Read Own Patient Profile', 'Read the specifically linked patient-safe profile.', 'OWN', NOW(), NOW()),
 ('20000000-0000-4000-8000-000000000041', 'portal.treatments.read', 'Read Own Published Treatments', 'Read published treatments belonging to the linked patient.', 'OWN', NOW(), NOW()),
 ('20000000-0000-4000-8000-000000000042', 'portal.appointments.read', 'Read Own Appointments', 'Read patient-safe appointments for the linked patient.', 'OWN', NOW(), NOW()),
 ('20000000-0000-4000-8000-000000000043', 'portal.appointments.request', 'Request Own Appointments', 'Request appointments or changes for the linked patient.', 'OWN', NOW(), NOW()),
 ('20000000-0000-4000-8000-000000000044', 'portal.documents.read', 'Read Own Published Documents', 'Read eligible visible documents for the linked patient.', 'OWN', NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    updated_at = EXCLUDED.updated_at;

DELETE FROM role_permissions rp USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND p.code IN ('portal.profile.read', 'portal.treatments.read',
                 'portal.appointments.read', 'portal.appointments.request', 'portal.documents.read')
  AND r.code <> 'PATIENT';

INSERT INTO role_permissions (role_id, permission_id, granted_at)
SELECT r.id, p.id, NOW() FROM roles r CROSS JOIN permissions p
WHERE r.code = 'PATIENT'
  AND p.code IN ('portal.profile.read', 'portal.treatments.read',
                 'portal.appointments.read', 'portal.appointments.request', 'portal.documents.read')
ON CONFLICT (role_id, permission_id) DO NOTHING;
