-- Phase 15C LOCAL DRAFT ONLY: internal payment/collection ledger (NOT an official receipt).
-- Depends on unapplied migrations 0016 and 0017. Never execute in hosted staging without approval.

ALTER TABLE invoices DROP CONSTRAINT invoices_draft_totals;
ALTER TABLE invoices ADD CONSTRAINT invoices_collection_totals CHECK (
  adjustment_total=0 AND total_amount=subtotal-discount_total
  AND discount_total<=subtotal AND amount_paid>=0
  AND amount_paid<=total_amount AND balance_due=total_amount-amount_paid
  AND (status <> 'draft' OR amount_paid=0)
  AND (status <> 'void' OR amount_paid=0)
);
ALTER TABLE invoices ADD CONSTRAINT invoices_payment_scope UNIQUE(id,patient_id,branch_id);

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
  payment_method TEXT NOT NULL CHECK(payment_method IN
    ('Cash','GCash','Bank Transfer','Credit Card','Debit Card','Cheque','Other')),
  reference_number TEXT CHECK(reference_number IS NULL OR length(reference_number) BETWEEN 1 AND 120),
  notes TEXT CHECK(notes IS NULL OR length(notes)<=500),
  received_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'posted',
  receipt_number TEXT CHECK(receipt_number IS NULL), -- official numbering is NOT configured
  idempotency_key UUID NOT NULL,
  request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  reversal_reason TEXT,
  CONSTRAINT payments_scope UNIQUE(id,patient_id,branch_id),
  CONSTRAINT payments_dedup UNIQUE(received_by,idempotency_key),
  CONSTRAINT payments_lifecycle CHECK(
    (status='posted' AND reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
    OR (status='reversed' AND reversed_at IS NOT NULL AND reversed_by IS NOT NULL
        AND length(trim(reversal_reason)) BETWEEN 5 AND 500)
  )
);
CREATE INDEX payments_branch_day_idx ON payments(branch_id,payment_date DESC);

CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_allocations_scope_payment FOREIGN KEY(payment_id,patient_id,branch_id)
    REFERENCES payments(id,patient_id,branch_id) ON DELETE RESTRICT,
  CONSTRAINT payment_allocations_scope_invoice FOREIGN KEY(invoice_id,patient_id,branch_id)
    REFERENCES invoices(id,patient_id,branch_id) ON DELETE RESTRICT,
  CONSTRAINT payment_allocations_payment_invoice UNIQUE(payment_id,invoice_id),
  CONSTRAINT payment_allocations_identity UNIQUE(id,payment_id,invoice_id)
);
CREATE INDEX payment_allocations_invoice_idx ON payment_allocations(invoice_id);

CREATE TABLE refunds (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL,
  payment_allocation_id UUID NOT NULL,
  invoice_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK(amount>0),
  refund_method TEXT NOT NULL CHECK(refund_method IN
    ('Cash','GCash','Bank Transfer','Credit Card','Debit Card','Cheque','Other')),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
  status TEXT NOT NULL DEFAULT 'recorded' CHECK(status='recorded'),
  recorded_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL,
  request_fingerprint TEXT NOT NULL CHECK(request_fingerprint ~ '^[0-9a-f]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT refunds_payment_allocation_scope FOREIGN KEY(payment_allocation_id,payment_id,invoice_id)
   REFERENCES payment_allocations(id,payment_id,invoice_id) ON DELETE RESTRICT,
  CONSTRAINT refunds_dedup UNIQUE(recorded_by,idempotency_key)
);
CREATE INDEX refunds_allocation_idx ON refunds(payment_allocation_id);

-- Append-only collection events. The original payment and allocations remain.
CREATE TABLE payment_status_events (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  old_status TEXT NOT NULL CHECK(old_status='posted'),
  new_status TEXT NOT NULL CHECK(new_status='reversed'),
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
  actor_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_status_events ENABLE ROW LEVEL SECURITY;

-- RLS has NO public/browser policies; private backend service owns transaction access.
-- Always verify the full amount was allocated by COMMIT, not during the first INSERT.
CREATE OR REPLACE FUNCTION finance_assert_payment_fully_allocated() RETURNS trigger AS $$
DECLARE
  payment_uuid UUID;
  paid NUMERIC(12,2);
  allocated NUMERIC(12,2);
BEGIN
  IF TG_TABLE_NAME='payments' THEN
    payment_uuid := NEW.id;
  ELSE
    payment_uuid := NEW.payment_id;
  END IF;
  SELECT amount INTO paid FROM payments WHERE id=payment_uuid;
  SELECT COALESCE(SUM(amount),0) INTO allocated FROM payment_allocations WHERE payment_id=payment_uuid;
  IF paid IS NULL OR paid<>allocated THEN
    RAISE EXCEPTION 'Payment allocations must sum to payment amount';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER payment_amount_fully_allocated
 AFTER INSERT OR UPDATE ON payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION finance_assert_payment_fully_allocated();
CREATE CONSTRAINT TRIGGER allocation_amount_fully_allocated
 AFTER INSERT ON payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
 EXECUTE FUNCTION finance_assert_payment_fully_allocated();

CREATE OR REPLACE FUNCTION protect_posted_payment() RETURNS trigger AS $$
BEGIN
 IF OLD.status='reversed' OR NEW.status<>'reversed'
    OR ROW(NEW.id,NEW.patient_id,NEW.branch_id,NEW.payment_date,NEW.amount,
        NEW.payment_method,NEW.reference_number,NEW.notes,NEW.received_by,
        NEW.receipt_number,NEW.idempotency_key,NEW.request_fingerprint,NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.patient_id,OLD.branch_id,OLD.payment_date,OLD.amount,
        OLD.payment_method,OLD.reference_number,OLD.notes,OLD.received_by,
        OLD.receipt_number,OLD.idempotency_key,OLD.request_fingerprint,OLD.created_at)
 THEN RAISE EXCEPTION 'Posted payments are immutable except controlled reversal';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payments_protect_history BEFORE UPDATE ON payments FOR EACH ROW
 EXECUTE FUNCTION protect_posted_payment();

CREATE OR REPLACE FUNCTION protect_collection_rows() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Posted collection rows cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER allocation_history_immutable BEFORE UPDATE OR DELETE ON payment_allocations
 FOR EACH ROW EXECUTE FUNCTION protect_collection_rows();
CREATE TRIGGER refunds_history_immutable BEFORE UPDATE OR DELETE ON refunds
 FOR EACH ROW EXECUTE FUNCTION protect_collection_rows();
CREATE TRIGGER payment_status_history_immutable BEFORE UPDATE OR DELETE ON payment_status_events
 FOR EACH ROW EXECUTE FUNCTION protect_collection_rows();

CREATE OR REPLACE FUNCTION check_refund_available() RETURNS trigger AS $$
DECLARE
  payment_state TEXT;
  paid NUMERIC(12,2);
  refunded NUMERIC(12,2);
BEGIN
  -- Serializes competing refunds targeting the SAME allocation.
  SELECT pa.amount,p.status INTO paid,payment_state
   FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id
   WHERE pa.id=NEW.payment_allocation_id
     AND pa.payment_id=NEW.payment_id AND pa.invoice_id=NEW.invoice_id
   FOR UPDATE OF pa;
  IF paid IS NULL OR payment_state<>'posted' THEN
    RAISE EXCEPTION 'Refund requires a posted payment allocation';
  END IF;
  SELECT COALESCE(SUM(amount),0) INTO refunded FROM refunds
    WHERE payment_allocation_id=NEW.payment_allocation_id;
  IF refunded+NEW.amount>paid THEN RAISE EXCEPTION 'Refund exceeds original allocation'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER refunds_check_allocation BEFORE INSERT ON refunds FOR EACH ROW
 EXECUTE FUNCTION check_refund_available();

-- Phase 15B trigger is deliberately replaced, never bypassed. Only derived
-- collection balances can change on finalized invoices, and only when they
-- exactly agree with posted allocations minus recorded refunds.
CREATE OR REPLACE FUNCTION protect_invoice_financial_history() RETURNS trigger AS $$
DECLARE
  allocated NUMERIC(12,2);
  refunded NUMERIC(12,2);
  expected NUMERIC(12,2);
BEGIN
  IF OLD.status IN ('finalized','void') THEN
    IF ROW(NEW.patient_id,NEW.branch_id,NEW.treatment_id,NEW.invoice_date,NEW.due_date,
       NEW.subtotal,NEW.discount_total,NEW.adjustment_total,NEW.total_amount,
       NEW.created_by,NEW.created_at,NEW.finalized_at,NEW.finalized_by,
       NEW.internal_reference,NEW.invoice_number)
       IS DISTINCT FROM ROW(OLD.patient_id,OLD.branch_id,OLD.treatment_id,OLD.invoice_date,OLD.due_date,
       OLD.subtotal,OLD.discount_total,OLD.adjustment_total,OLD.total_amount,
       OLD.created_by,OLD.created_at,OLD.finalized_at,OLD.finalized_by,
       OLD.internal_reference,OLD.invoice_number) THEN
      RAISE EXCEPTION 'Finalized invoice financial fields cannot be modified';
    END IF;
    IF OLD.status='void' THEN RAISE EXCEPTION 'Voided invoices are immutable'; END IF;
    IF NEW.status NOT IN ('finalized','void') THEN RAISE EXCEPTION 'Invalid invoice transition'; END IF;
    IF NEW.status='finalized' AND
        (NEW.voided_at IS DISTINCT FROM OLD.voided_at
        OR NEW.voided_by IS DISTINCT FROM OLD.voided_by
        OR NEW.void_reason IS DISTINCT FROM OLD.void_reason) THEN
      RAISE EXCEPTION 'Finalized invoice void metadata is immutable';
    END IF;
    IF NEW.status='void' AND
       (NEW.voided_at IS NULL OR NEW.voided_by IS NULL OR length(trim(NEW.void_reason))<5) THEN
      RAISE EXCEPTION 'Voids require a reason and actor';
    END IF;
    SELECT COALESCE(SUM(pa.amount),0) INTO allocated
     FROM payment_allocations pa JOIN payments p ON p.id=pa.payment_id
     WHERE pa.invoice_id=NEW.id AND p.status='posted';
    SELECT COALESCE(SUM(r.amount),0) INTO refunded
     FROM refunds r JOIN payment_allocations pa ON pa.id=r.payment_allocation_id
     JOIN payments p ON p.id=r.payment_id
     WHERE pa.invoice_id=NEW.id AND p.status='posted' AND r.status='recorded';
    expected:=allocated-refunded;
    IF expected<0 OR NEW.amount_paid<>expected OR NEW.balance_due<>NEW.total_amount-expected THEN
      RAISE EXCEPTION 'Collection balances do not match posted ledger';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO permissions(id,code,name,description,scope,created_at,updated_at) VALUES
 ('20000000-0000-4000-8000-000000000052','finance.payment.record','Record Payment','Record internal payment and allocations with audit.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000053','finance.payment.read','Read Payments','Read allocated payment transactions for authorized branch.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000054','finance.payment.reverse','Reverse Payment','Reverse posted internal payment with reason and audit.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000055','finance.refund.record','Record Refund','Record controlled refund against allocated collection.','BRANCH',NOW(),NOW())
 ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,granted_at)
 SELECT r.id,p.id,NOW() FROM roles r JOIN permissions p
 ON (r.code='PERSONNEL' AND p.code IN ('finance.payment.record','finance.payment.read','finance.payment.reverse','finance.refund.record'))
 OR (r.code='DENTIST' AND p.code IN ('finance.payment.record','finance.payment.read'))
 ON CONFLICT(role_id,permission_id) DO NOTHING;
