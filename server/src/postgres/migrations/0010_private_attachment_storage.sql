DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'treatments_id_patient_branch_unique'
  ) THEN
    ALTER TABLE treatments
      ADD CONSTRAINT treatments_id_patient_branch_unique
      UNIQUE (id, patient_id, branch_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  treatment_id UUID,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  checksum_sha256 TEXT,
  uploaded_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  is_patient_visible BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  status TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  CONSTRAINT attachments_treatment_patient_branch_fkey
    FOREIGN KEY (treatment_id, patient_id, branch_id)
    REFERENCES treatments(id, patient_id, branch_id)
    ON DELETE RESTRICT,
  CONSTRAINT attachments_category_not_blank CHECK (length(trim(category)) > 0),
  CONSTRAINT attachments_original_filename_not_blank CHECK (length(trim(original_filename)) > 0),
  CONSTRAINT attachments_object_key_not_blank CHECK (length(trim(object_key)) > 0),
  CONSTRAINT attachments_mime_type_not_blank CHECK (length(trim(mime_type)) > 0),
  CONSTRAINT attachments_size_bytes_valid CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  CONSTRAINT attachments_checksum_sha256_valid CHECK (
    checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT attachments_status_allowed CHECK (
    status IN ('pending', 'uploaded', 'failed', 'deleting', 'deleted')
  ),
  CONSTRAINT attachments_uploaded_state_valid CHECK (
    (status = 'uploaded' AND uploaded_at IS NOT NULL AND checksum_sha256 IS NOT NULL)
    OR status <> 'uploaded'
  ),
  CONSTRAINT attachments_deleted_state_valid CHECK (
    (status = 'deleted' AND deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
    OR status <> 'deleted'
  )
);

CREATE INDEX IF NOT EXISTS attachments_patient_time_idx
  ON attachments (patient_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS attachments_treatment_time_idx
  ON attachments (treatment_id, created_at DESC, id DESC)
  WHERE treatment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS attachments_branch_time_idx
  ON attachments (branch_id, created_at DESC, id DESC);

INSERT INTO permissions (id, code, name, description, scope, created_at, updated_at)
VALUES
  ('20000000-0000-4000-8000-000000000014', 'attachment.read', 'Read Attachments', 'Read private attachment metadata for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000015', 'attachment.create', 'Create Attachments', 'Create private attachments for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000016', 'attachment.download', 'Download Attachments', 'Issue private attachment download access for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000017', 'attachment.update', 'Update Attachment Metadata', 'Update permitted private attachment metadata for an allowed branch.', 'BRANCH', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000018', 'attachment.delete', 'Delete Attachments', 'Delete private attachment objects for an allowed branch while preserving metadata history.', 'BRANCH', NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    updated_at = EXCLUDED.updated_at;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.code IN (
    'attachment.read',
    'attachment.create',
    'attachment.download',
    'attachment.update',
    'attachment.delete'
  )
  AND NOT (
    (r.code = 'PERSONNEL' AND p.code IN ('attachment.read', 'attachment.create', 'attachment.download'))
    OR
    (r.code = 'DENTIST' AND p.code IN (
      'attachment.read',
      'attachment.create',
      'attachment.download',
      'attachment.update',
      'attachment.delete'
    ))
  );

INSERT INTO role_permissions (role_id, permission_id, granted_at)
SELECT r.id, p.id, NOW()
FROM roles r
JOIN permissions p ON (
  (r.code = 'PERSONNEL' AND p.code IN (
    'attachment.read',
    'attachment.create',
    'attachment.download'
  ))
  OR
  (r.code = 'DENTIST' AND p.code IN (
    'attachment.read',
    'attachment.create',
    'attachment.download',
    'attachment.update',
    'attachment.delete'
  ))
)
ON CONFLICT (role_id, permission_id) DO NOTHING;
