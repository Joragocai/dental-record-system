CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  auth_user_id UUID UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT app_users_email_not_blank CHECK (length(trim(email)) > 0),
  CONSTRAINT app_users_display_name_not_blank CHECK (length(trim(display_name)) > 0),
  CONSTRAINT app_users_status_allowed CHECK (status IN ('pending', 'active', 'suspended', 'deactivated'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_lower_unique
  ON app_users ((lower(trim(email))));

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT roles_code_not_blank CHECK (length(trim(code)) > 0),
  CONSTRAINT roles_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT roles_code_allowed CHECK (
    code IN ('PATIENT', 'PERSONNEL', 'DENTIST', 'CLINIC_ADMINISTRATOR', 'SYSTEM_ADMINISTRATOR')
  )
);

INSERT INTO roles (id, code, name, created_at, updated_at)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'PATIENT', 'Patient', NOW(), NOW()),
  ('10000000-0000-4000-8000-000000000002', 'PERSONNEL', 'Personnel', NOW(), NOW()),
  ('10000000-0000-4000-8000-000000000003', 'DENTIST', 'Dentist', NOW(), NOW()),
  ('10000000-0000-4000-8000-000000000004', 'CLINIC_ADMINISTRATOR', 'Clinic Administrator', NOW(), NOW()),
  ('10000000-0000-4000-8000-000000000005', 'SYSTEM_ADMINISTRATOR', 'System Administrator', NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    updated_at = EXCLUDED.updated_at;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS user_branches (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS user_branches_branch_id_idx ON user_branches(branch_id);
