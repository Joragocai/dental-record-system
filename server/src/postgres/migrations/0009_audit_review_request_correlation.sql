ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE INDEX IF NOT EXISTS audit_events_request_id_time_idx
  ON audit_events(request_id, occurred_at DESC);

INSERT INTO permissions (id, code, name, description, scope, created_at, updated_at)
VALUES
  ('20000000-0000-4000-8000-000000000012', 'audit.read', 'View Audit Trail', 'View the complete clinic audit trail.', 'GLOBAL', NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000013', 'audit.export', 'Export Audit Trail', 'Export the complete clinic audit trail.', 'GLOBAL', NOW(), NOW())
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    scope = EXCLUDED.scope,
    updated_at = EXCLUDED.updated_at;

DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.code IN ('audit.read', 'audit.export')
  AND r.code <> 'CLINIC_ADMINISTRATOR';

INSERT INTO role_permissions (role_id, permission_id, granted_at)
SELECT r.id, p.id, NOW()
FROM roles r
JOIN permissions p ON p.code IN ('audit.read', 'audit.export')
WHERE r.code = 'CLINIC_ADMINISTRATOR'
ON CONFLICT (role_id, permission_id) DO NOTHING;
