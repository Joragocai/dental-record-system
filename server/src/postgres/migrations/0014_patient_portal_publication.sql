-- Phase 14B: treatment publication is opt-in and hidden by default.
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS patient_visible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS patient_portal_summary TEXT;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS patient_published_at TIMESTAMPTZ;
ALTER TABLE treatments ADD COLUMN IF NOT EXISTS patient_published_by UUID REFERENCES app_users(id) ON DELETE RESTRICT;
ALTER TABLE treatments ADD CONSTRAINT treatment_patient_publication_consistency CHECK
 ((NOT patient_visible AND patient_portal_summary IS NULL AND patient_published_at IS NULL AND patient_published_by IS NULL)
 OR (patient_visible AND patient_portal_summary IS NOT NULL AND length(trim(patient_portal_summary)) BETWEEN 1 AND 1000
 AND patient_published_at IS NOT NULL AND patient_published_by IS NOT NULL));
CREATE INDEX IF NOT EXISTS treatment_patient_visible_history ON treatments(patient_id,treatment_date DESC,id DESC) WHERE patient_visible=TRUE;
INSERT INTO permissions(id,code,name,description,scope,created_at,updated_at) VALUES
 ('20000000-0000-4000-8000-000000000045','portal.profile.update','Update Own Contact','Update linked patient contact information only.','OWN',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000046','treatment.publish','Publish Treatment Summary','Dentist may publish a patient-safe summary.','BRANCH',NOW(),NOW())
 ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,granted_at)
 SELECT r.id,p.id,NOW() FROM roles r JOIN permissions p ON
 ((r.code='PATIENT' AND p.code='portal.profile.update') OR
 (r.code='DENTIST' AND p.code='treatment.publish'))
 ON CONFLICT(role_id,permission_id) DO NOTHING;
