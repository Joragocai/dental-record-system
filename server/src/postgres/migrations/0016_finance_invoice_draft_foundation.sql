-- Phase 15A local draft only. No payments or legal invoice issuance.
ALTER TABLE treatments ADD CONSTRAINT treatments_id_patient_branch_finance_unique UNIQUE(id,patient_id,branch_id);
CREATE TABLE IF NOT EXISTS invoices (
 id UUID PRIMARY KEY, patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 treatment_id UUID NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'draft',
 invoice_number TEXT UNIQUE,
 invoice_date DATE NOT NULL, due_date DATE,
 subtotal NUMERIC(12,2) NOT NULL, discount_total NUMERIC(12,2) NOT NULL,
 adjustment_total NUMERIC(12,2) NOT NULL DEFAULT 0,
 total_amount NUMERIC(12,2) NOT NULL,
 amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
 balance_due NUMERIC(12,2) NOT NULL,
 created_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 finalized_at TIMESTAMPTZ,voided_at TIMESTAMPTZ,void_reason TEXT,
 CONSTRAINT invoices_treatment_fkey FOREIGN KEY(treatment_id,patient_id,branch_id)
  REFERENCES treatments(id,patient_id,branch_id) ON DELETE RESTRICT,
 CONSTRAINT invoices_draft_only CHECK(status='draft' AND invoice_number IS NULL AND finalized_at IS NULL AND voided_at IS NULL AND void_reason IS NULL),
 CONSTRAINT invoices_nonnegative CHECK(subtotal>=0 AND discount_total>=0 AND total_amount>=0 AND balance_due>=0),
 CONSTRAINT invoices_draft_totals CHECK(adjustment_total=0 AND amount_paid=0 AND balance_due=total_amount AND total_amount=subtotal-discount_total AND discount_total<=subtotal),
 CONSTRAINT invoices_date_valid CHECK(due_date IS NULL OR due_date>=invoice_date)
);
ALTER TABLE invoices ADD CONSTRAINT invoices_id_treatment_unique UNIQUE(id,treatment_id);
CREATE INDEX IF NOT EXISTS invoices_patient_branch_idx ON invoices(patient_id,branch_id,created_at DESC);
CREATE TABLE IF NOT EXISTS invoice_items (
 id UUID PRIMARY KEY,
 invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
 treatment_id UUID NOT NULL UNIQUE REFERENCES treatments(id) ON DELETE RESTRICT,
 CONSTRAINT invoice_items_invoice_treatment_fkey FOREIGN KEY(invoice_id,treatment_id) REFERENCES invoices(id,treatment_id) ON DELETE RESTRICT,
 procedure_code TEXT NOT NULL,
 procedure_name TEXT NOT NULL,
 description TEXT,
 quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity=1),
 unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price>=0),
 discount_amount NUMERIC(12,2) NOT NULL CHECK(discount_amount>=0),
 line_total NUMERIC(12,2) NOT NULL,
 CONSTRAINT invoice_items_price_check CHECK(line_total=unit_price-discount_amount AND discount_amount<=unit_price),
 CONSTRAINT invoice_items_procedure CHECK(length(trim(procedure_name)) BETWEEN 1 AND 200)
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
INSERT INTO permissions(id,code,name,description,scope,created_at,updated_at) VALUES
 ('20000000-0000-4000-8000-000000000047','finance.invoice.draft','Draft Invoice','Draft an invoice from a verified unbilled treatment.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000048','finance.invoice.read','Read Invoice','Read invoice in an authorized clinic branch.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000049','finance.admin.read','Financial Oversight','View approved finance reports when implemented.','GLOBAL',NOW(),NOW())
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,granted_at)
 SELECT r.id,p.id,NOW() FROM roles r JOIN permissions p
 ON (r.code='PERSONNEL' AND p.code IN ('finance.invoice.draft','finance.invoice.read'))
 OR (r.code='DENTIST' AND p.code IN ('finance.invoice.draft','finance.invoice.read'))
 OR (r.code='CLINIC_ADMINISTRATOR' AND p.code='finance.admin.read')
 ON CONFLICT(role_id,permission_id) DO NOTHING;
