CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT permissions_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT permissions_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT permissions_description_not_blank CHECK (length(trim(description)) > 0),
  CONSTRAINT permissions_scope_allowed CHECK (scope IN ('GLOBAL', 'BRANCH', 'OWN'))
);

INSERT INTO permissions (id, code, name, description, scope, created_at, updated_at)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'user.read', 'View Users', 'View application user identities and account status.', 'GLOBAL', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000002', 'staff_account.create', 'Create Staff Accounts', 'Initiate approved staff account creation.', 'GLOBAL', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000003', 'role_assignment.approve', 'Approve Role Assignments', 'Approve operational role assignments.', 'GLOBAL', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000004', 'role_definition.configure', 'Configure Role Definitions', 'Configure technical role and permission definitions after clinic approval.', 'GLOBAL', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000005', 'patient.list', 'List Patients', 'List patients for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000006', 'patient.read', 'Read Patient Records', 'Read patient records for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000007', 'patient.create', 'Create Patients', 'Create patient records for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000008', 'patient.demographics.update', 'Update Patient Demographics', 'Update permitted patient demographic fields for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000009', 'treatment.read', 'Read Treatments', 'Read treatment history for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000010', 'treatment.internal_notes.read', 'Read Internal Dentist Notes', 'Read internal dentist-only treatment notes for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000011', 'treatment.finalize', 'Finalize Treatments', 'Finalize treatment records for an allowed branch.', 'BRANCH', NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    updated_at = EXCLUDED.updated_at;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS role_permissions_permission_id_idx ON role_permissions(permission_id);

INSERT INTO role_permissions (role_id, permission_id, granted_at)
SELECT r.id, p.id, NOW()
FROM roles r
JOIN permissions p ON (
  (r.code = 'PERSONNEL' AND p.code IN (
    'patient.list',
    'patient.read',
    'patient.create',
    'patient.demographics.update',
    'treatment.read'
  ))
  OR
  (r.code = 'DENTIST' AND p.code IN (
    'patient.list',
    'patient.read',
    'patient.create',
    'patient.demographics.update',
    'treatment.read',
    'treatment.internal_notes.read',
    'treatment.finalize'
  ))
  OR
  (r.code = 'CLINIC_ADMINISTRATOR' AND p.code IN (
    'user.read',
    'staff_account.create',
    'role_assignment.approve'
  ))
  OR
  (r.code = 'SYSTEM_ADMINISTRATOR' AND p.code IN (
    'user.read',
    'role_definition.configure'
  ))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
