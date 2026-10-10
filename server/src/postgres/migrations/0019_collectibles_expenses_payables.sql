-- Phase 15D local-only foundation. Depends on migrations 0016-0018.
-- No real accounting settlement, tax invoice, or cash closing is enabled.
CREATE TABLE expense_categories (
 code TEXT PRIMARY KEY CHECK(code ~ '^[A-Z_]{3,36}$'),
 name TEXT NOT NULL UNIQUE CHECK(length(trim(name)) BETWEEN 3 AND 80)
);
INSERT INTO expense_categories(code,name) VALUES
 ('DENTAL_SUPPLIES','Dental Supplies'),('CLEANING_SUPPLIES','Cleaning Supplies'),
 ('OFFICE_SUPPLIES','Office Supplies'),('UTILITIES','Utilities'),('RENT','Rent'),
 ('LABORATORY_FEES','Laboratory Fees'),('EQUIPMENT','Equipment'),
 ('MAINTENANCE','Maintenance'),('TRANSPORTATION','Transportation'),
 ('STAFF_EXPENSE','Staff Expense'),('MISCELLANEOUS','Miscellaneous');

CREATE TABLE suppliers (
 id UUID PRIMARY KEY,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 150),
 contact_name TEXT CHECK(contact_name IS NULL OR length(contact_name)<=120),
 phone TEXT CHECK(phone IS NULL OR length(phone)<=40),
 email TEXT CHECK(email IS NULL OR length(email)<=254),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT suppliers_branch_identity UNIQUE(id,branch_id)
);
CREATE UNIQUE INDEX suppliers_branch_name_unique ON suppliers(branch_id,lower(trim(name)));
CREATE INDEX suppliers_branch_list_idx ON suppliers(branch_id,name);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE TABLE expenses (
 id UUID PRIMARY KEY,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 expense_date DATE NOT NULL,
 category_code TEXT NOT NULL REFERENCES expense_categories(code) ON DELETE RESTRICT,
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 5 AND 500),
 supplier_id UUID,
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 payment_method TEXT, -- paid/disbursed expense workflow is later; NULL is intentional
 reference_number TEXT,
 receipt_attachment_id UUID, -- must be attached/verified in a separately reviewed workflow
 entered_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending','approved','rejected')),
 approved_by UUID REFERENCES app_users(id) ON DELETE RESTRICT,
 approved_at TIMESTAMPTZ,
 rejection_reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT expenses_supplier_scope FOREIGN KEY(supplier_id,branch_id)
  REFERENCES suppliers(id,branch_id) ON DELETE RESTRICT,
 CONSTRAINT expenses_not_marked_paid CHECK(payment_method IS NULL AND reference_number IS NULL AND receipt_attachment_id IS NULL),
 CONSTRAINT expenses_approval_state CHECK(
  (approval_status='pending' AND approved_by IS NULL AND approved_at IS NULL AND rejection_reason IS NULL)
  OR (approval_status='approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND rejection_reason IS NULL)
  OR (approval_status='rejected' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND length(trim(rejection_reason)) BETWEEN 5 AND 500)
 )
);
CREATE INDEX expenses_branch_date_idx ON expenses(branch_id,expense_date DESC,id DESC);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE accounts_payable (
 id UUID PRIMARY KEY,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 supplier_id UUID NOT NULL,
 bill_number TEXT NOT NULL CHECK(length(trim(bill_number)) BETWEEN 1 AND 100),
 bill_date DATE NOT NULL,
 due_date DATE,
 description TEXT CHECK(description IS NULL OR length(description)<=500),
 original_amount NUMERIC(12,2) NOT NULL CHECK(original_amount>0),
 amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(amount_paid>=0),
 outstanding_amount NUMERIC(12,2) NOT NULL,
 approval_status TEXT NOT NULL DEFAULT 'pending'
  CHECK(approval_status IN ('pending','approved','rejected')),
 payment_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK(payment_status IN ('unpaid','partial','paid')),
 entered_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 approved_by UUID REFERENCES app_users(id) ON DELETE RESTRICT,
 approved_at TIMESTAMPTZ,
 rejection_reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT payable_supplier_scope FOREIGN KEY(supplier_id,branch_id)
  REFERENCES suppliers(id,branch_id) ON DELETE RESTRICT,
 CONSTRAINT payable_identity_scope UNIQUE(id,branch_id),
 CONSTRAINT payable_supplier_bill UNIQUE(branch_id,supplier_id,bill_number),
 CONSTRAINT payable_dates CHECK(due_date IS NULL OR due_date>=bill_date),
 CONSTRAINT payable_amounts CHECK(outstanding_amount=original_amount-amount_paid
   AND amount_paid<=original_amount
   AND ((amount_paid=0 AND payment_status='unpaid')
     OR (amount_paid>0 AND amount_paid<original_amount AND payment_status='partial')
     OR (amount_paid=original_amount AND payment_status='paid'))
   AND (approval_status='approved' OR amount_paid=0)),
 CONSTRAINT payable_approval CHECK(
  (approval_status='pending' AND approved_by IS NULL AND approved_at IS NULL AND rejection_reason IS NULL)
  OR (approval_status='approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND rejection_reason IS NULL)
  OR (approval_status='rejected' AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND length(trim(rejection_reason)) BETWEEN 5 AND 500))
);
CREATE INDEX payable_branch_due_idx ON accounts_payable(branch_id,due_date,id);
ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;

CREATE TABLE payable_payments (
 id UUID PRIMARY KEY,
 payable_id UUID NOT NULL,
 branch_id UUID NOT NULL,
 amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
 payment_method TEXT NOT NULL CHECK(payment_method IN
  ('Cash','GCash','Bank Transfer','Credit Card','Debit Card','Cheque','Other')),
 reference_number TEXT CHECK(reference_number IS NULL OR length(reference_number)<=120),
 recorded_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 idempotency_key UUID NOT NULL,
 request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT payable_payment_scope FOREIGN KEY(payable_id,branch_id)
  REFERENCES accounts_payable(id,branch_id) ON DELETE RESTRICT,
 CONSTRAINT payable_payment_idempotency UNIQUE(recorded_by,idempotency_key)
);
CREATE INDEX payable_payment_history_idx ON payable_payments(payable_id,recorded_at);
ALTER TABLE payable_payments ENABLE ROW LEVEL SECURITY;

-- For completeness in the future, invoice follow-ups retain the actual invoice
-- branch (the patient's registration branch is not the billing branch).
ALTER TABLE invoices ADD CONSTRAINT invoices_id_branch_collectibles_unique UNIQUE(id,branch_id);
CREATE TABLE receivable_followups (
 id UUID PRIMARY KEY,
 invoice_id UUID NOT NULL,
 branch_id UUID NOT NULL,
 note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 5 AND 500),
 next_followup_date DATE,
 recorded_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT followup_invoice_branch FOREIGN KEY(invoice_id,branch_id)
  REFERENCES invoices(id,branch_id) ON DELETE RESTRICT
);
CREATE INDEX receivable_followups_invoice_idx ON receivable_followups(invoice_id,created_at DESC);
ALTER TABLE receivable_followups ENABLE ROW LEVEL SECURITY;

-- Prevent altering settled payable entries without compensating future workflow.
CREATE OR REPLACE FUNCTION protect_payable_payment_history() RETURNS trigger AS $$
BEGIN
 RAISE EXCEPTION 'Payable payment history is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payable_payment_immutable BEFORE UPDATE OR DELETE ON payable_payments
 FOR EACH ROW EXECUTE FUNCTION protect_payable_payment_history();

CREATE OR REPLACE FUNCTION enforce_payable_payment_limit() RETURNS trigger AS $$
DECLARE bill accounts_payable%ROWTYPE;
BEGIN
 SELECT * INTO bill FROM accounts_payable WHERE id=NEW.payable_id AND branch_id=NEW.branch_id FOR UPDATE;
 IF NOT FOUND OR bill.approval_status<>'approved' OR NEW.amount>bill.outstanding_amount THEN
  RAISE EXCEPTION 'Payable not approved or amount exceeds outstanding';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payable_payments_limit BEFORE INSERT ON payable_payments FOR EACH ROW
 EXECUTE FUNCTION enforce_payable_payment_limit();

CREATE OR REPLACE FUNCTION check_payable_payment_totals() RETURNS trigger AS $$
DECLARE recorded NUMERIC(12,2); stored NUMERIC(12,2); target UUID;
BEGIN
 IF TG_TABLE_NAME='accounts_payable' THEN
   target:=NEW.id;
 ELSE
   target:=NEW.payable_id;
 END IF;
 SELECT amount_paid INTO stored FROM accounts_payable WHERE id=target;
 SELECT COALESCE(SUM(amount),0) INTO recorded FROM payable_payments WHERE payable_id=target;
 IF stored IS NULL OR stored<>recorded THEN
  RAISE EXCEPTION 'Payable balance disagrees with append-only payment history';
 END IF;
 RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER payable_total_on_payment
 AFTER INSERT ON payable_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION check_payable_payment_totals();
CREATE CONSTRAINT TRIGGER payable_total_on_update
 AFTER UPDATE ON accounts_payable DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION check_payable_payment_totals();

CREATE OR REPLACE FUNCTION protect_approved_payable() RETURNS trigger AS $$
BEGIN
 IF OLD.approval_status IN ('approved','rejected') THEN
  IF ROW(NEW.id,NEW.branch_id,NEW.supplier_id,NEW.bill_number,NEW.bill_date,NEW.due_date,
        NEW.description,NEW.original_amount,NEW.approval_status,NEW.approved_by,NEW.approved_at,
        NEW.rejection_reason,NEW.entered_by,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.branch_id,OLD.supplier_id,OLD.bill_number,OLD.bill_date,OLD.due_date,
        OLD.description,OLD.original_amount,OLD.approval_status,OLD.approved_by,OLD.approved_at,
        OLD.rejection_reason,OLD.entered_by,OLD.created_at) THEN
   RAISE EXCEPTION 'Approved/rejected payable details are immutable';
  END IF;
  IF NEW.amount_paid<OLD.amount_paid THEN RAISE EXCEPTION 'Payable payments cannot be silently reversed'; END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payable_details_immutable BEFORE UPDATE ON accounts_payable FOR EACH ROW
 EXECUTE FUNCTION protect_approved_payable();

CREATE OR REPLACE FUNCTION protect_reviewed_expense() RETURNS trigger AS $$
BEGIN
 IF OLD.approval_status<>'pending' THEN
  RAISE EXCEPTION 'Reviewed expenses are immutable';
 END IF;
 IF NEW.approval_status='pending' THEN
  RAISE EXCEPTION 'Expense modification without review is prohibited';
 END IF;
 IF ROW(NEW.id,NEW.branch_id,NEW.expense_date,NEW.category_code,NEW.description,
        NEW.supplier_id,NEW.amount,NEW.entered_by,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.branch_id,OLD.expense_date,OLD.category_code,OLD.description,
        OLD.supplier_id,OLD.amount,OLD.entered_by,OLD.created_at) THEN
  RAISE EXCEPTION 'Expense identifying fields cannot be changed during review';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER expenses_review_integrity BEFORE UPDATE ON expenses FOR EACH ROW
 EXECUTE FUNCTION protect_reviewed_expense();

INSERT INTO permissions(id,code,name,description,scope,created_at,updated_at) VALUES
 ('20000000-0000-4000-8000-000000000056','finance.receivables.read','Read Collectibles','Read outstanding finalized invoice balances and aging in authorized branch.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000057','finance.receivables.followup','Record Collectibles Follow-up','Record a branch-scoped collection follow-up without changing the balance.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000058','finance.expense.create','Record Expense','Register pending clinic expenses.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000059','finance.expense.read','Read Expenses','Read branch expense records.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000060','finance.expense.approve','Review Expenses','Approve or reject pending expenses for the clinic.','GLOBAL',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000061','finance.supplier.create','Register Supplier','Register suppliers for assigned clinic branches.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000062','finance.supplier.read','Read Suppliers','List suppliers for assigned clinic branches.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000063','finance.payable.create','Register Supplier Bill','Register a pending supplier payable in assigned branch.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000064','finance.payable.read','Read Supplier Bills','Read supplier payable balances for assigned branch.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000065','finance.payable.approve','Review Supplier Bills','Approve or reject pending supplier bills clinic-wide.','GLOBAL',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000066','finance.payable.pay','Record Supplier Payment','Record a payment against an approved supplier payable.','BRANCH',NOW(),NOW())
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,granted_at)
 SELECT r.id,p.id,NOW() FROM roles r CROSS JOIN permissions p
 WHERE (r.code='PERSONNEL' AND p.code IN (
   'finance.receivables.read','finance.receivables.followup','finance.expense.create','finance.expense.read',
   'finance.supplier.create','finance.supplier.read','finance.payable.create','finance.payable.read','finance.payable.pay'))
 OR (r.code='DENTIST' AND p.code='finance.receivables.read')
 OR (r.code='CLINIC_ADMINISTRATOR' AND p.code IN (
   'finance.expense.approve','finance.payable.approve'))
ON CONFLICT(role_id,permission_id) DO NOTHING;
