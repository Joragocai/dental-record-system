-- Phase 15B: internal ledger finalization only; no statutory invoice/receipt issuance.
ALTER TABLE invoices DROP CONSTRAINT invoices_draft_only;
ALTER TABLE invoices ADD COLUMN internal_reference TEXT UNIQUE;
ALTER TABLE invoices ADD COLUMN finalized_by UUID REFERENCES app_users(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD COLUMN voided_by UUID REFERENCES app_users(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD CONSTRAINT invoices_lifecycle CHECK (
 (status='draft' AND internal_reference IS NULL AND invoice_number IS NULL AND finalized_at IS NULL AND finalized_by IS NULL AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
 OR (status='finalized' AND internal_reference IS NOT NULL AND invoice_number IS NULL AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL AND voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
 OR (status='void' AND internal_reference IS NOT NULL AND invoice_number IS NULL AND finalized_at IS NOT NULL AND finalized_by IS NOT NULL AND voided_at IS NOT NULL AND voided_by IS NOT NULL AND length(trim(void_reason)) BETWEEN 5 AND 500)
);
ALTER TABLE invoices ADD CONSTRAINT invoices_internal_reference_length CHECK (internal_reference IS NULL OR internal_reference ~ '^INT-[0-9]{4}-[0-9]{6}$');
CREATE TABLE finance_reference_counters (
 calendar_year INTEGER PRIMARY KEY CHECK(calendar_year>=2020),
 last_sequence INTEGER NOT NULL CHECK(last_sequence>0)
);
CREATE TABLE invoice_status_events (
 id UUID PRIMARY KEY, invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
 old_status TEXT NOT NULL,new_status TEXT NOT NULL,reason TEXT,
 actor_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK ((old_status='draft' AND new_status='finalized' AND reason IS NULL)
 OR (old_status='finalized' AND new_status='void' AND length(trim(reason)) BETWEEN 5 AND 500))
);
ALTER TABLE invoice_status_events ENABLE ROW LEVEL SECURITY;

-- No direct invoice row rewriting once an internal document leaves draft state.
-- Later payment posting must use a separately reviewed migration/workflow.
CREATE OR REPLACE FUNCTION protect_invoice_financial_history() RETURNS trigger AS $$
BEGIN
 IF OLD.status IN ('finalized','void') THEN
  IF ROW(NEW.patient_id,NEW.branch_id,NEW.treatment_id,NEW.invoice_date,NEW.due_date,
       NEW.subtotal,NEW.discount_total,NEW.adjustment_total,NEW.total_amount,
       NEW.amount_paid,NEW.balance_due,NEW.created_by,NEW.created_at,NEW.finalized_at,
       NEW.finalized_by,NEW.internal_reference,NEW.invoice_number)
     IS DISTINCT FROM
     ROW(OLD.patient_id,OLD.branch_id,OLD.treatment_id,OLD.invoice_date,OLD.due_date,
       OLD.subtotal,OLD.discount_total,OLD.adjustment_total,OLD.total_amount,
       OLD.amount_paid,OLD.balance_due,OLD.created_by,OLD.created_at,OLD.finalized_at,
       OLD.finalized_by,OLD.internal_reference,OLD.invoice_number) THEN
    RAISE EXCEPTION 'Finalized invoice financial fields cannot be modified';
  END IF;
  IF OLD.status='void' THEN RAISE EXCEPTION 'Voided invoices are immutable'; END IF;
  IF NEW.status<>'void' OR NEW.voided_at IS NULL OR NEW.voided_by IS NULL
     OR length(trim(NEW.void_reason))<5 THEN
    RAISE EXCEPTION 'Finalized invoices permit only audited void transition';
  END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER invoices_protect_financial_history
 BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_invoice_financial_history();

CREATE OR REPLACE FUNCTION protect_invoice_items_after_finalization() RETURNS trigger AS $$
DECLARE parent_status TEXT;
BEGIN
 SELECT status INTO parent_status FROM invoices WHERE id=COALESCE(OLD.invoice_id,NEW.invoice_id);
 IF parent_status<>'draft' THEN RAISE EXCEPTION 'Finalized invoice items are immutable'; END IF;
 IF TG_OP='UPDATE' AND OLD.invoice_id<>NEW.invoice_id THEN
  RAISE EXCEPTION 'Reparenting invoice items is not allowed';
 END IF;
 RETURN COALESCE(NEW,OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER invoice_items_protect_history
 BEFORE UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION protect_invoice_items_after_finalization();

INSERT INTO permissions(id,code,name,description,scope,created_at,updated_at) VALUES
 ('20000000-0000-4000-8000-000000000050','finance.invoice.finalize','Finalize Internal Billing','Finalize internal billing records only; not an official receipt.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000051','finance.invoice.void','Void Internal Billing','Void finalized internal billing with a reason.','BRANCH',NOW(),NOW())
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,granted_at)
 SELECT r.id,p.id,NOW() FROM roles r JOIN permissions p
 ON r.code='PERSONNEL' AND p.code IN ('finance.invoice.finalize','finance.invoice.void')
 OR r.code='DENTIST' AND p.code IN ('finance.invoice.finalize','finance.invoice.void')
ON CONFLICT(role_id,permission_id) DO NOTHING;
