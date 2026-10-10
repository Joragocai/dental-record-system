-- Phase 15E local-only daily finance and patient-owned projections.
-- Depends on 0016-0019. Not a statutory accounting ledger or receipt issuer.
CREATE TABLE cash_opening_balances (
 id UUID PRIMARY KEY,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 business_date DATE NOT NULL,
 opening_cash NUMERIC(12,2) NOT NULL CHECK(opening_cash>=0),
 reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 5 AND 500),
 authorized_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(branch_id,business_date)
);
ALTER TABLE cash_opening_balances ENABLE ROW LEVEL SECURITY;

CREATE TABLE daily_closings (
 id UUID PRIMARY KEY,
 branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
 business_date DATE NOT NULL,
 opening_cash NUMERIC(12,2) NOT NULL CHECK(opening_cash>=0),
 cash_receipts NUMERIC(12,2) NOT NULL CHECK(cash_receipts>=0),
 cash_reversals NUMERIC(12,2) NOT NULL CHECK(cash_reversals>=0),
 cash_refunds NUMERIC(12,2) NOT NULL CHECK(cash_refunds>=0),
 cash_supplier_payments NUMERIC(12,2) NOT NULL CHECK(cash_supplier_payments>=0),
 expected_cash NUMERIC(12,2) NOT NULL CHECK(expected_cash>=0),
 actual_cash NUMERIC(12,2) NOT NULL CHECK(actual_cash>=0),
 cash_difference NUMERIC(12,2) NOT NULL,
 cash_movements_attested BOOLEAN NOT NULL CHECK(cash_movements_attested),
 discrepancy_reason TEXT,
 status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected')),
 submitted_by UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 reviewed_by UUID REFERENCES app_users(id) ON DELETE RESTRICT,
 reviewed_at TIMESTAMPTZ,
 review_reason TEXT,
 UNIQUE(branch_id,business_date),
 CONSTRAINT daily_closings_snapshot_math CHECK(
  expected_cash=opening_cash+cash_receipts-cash_reversals-cash_refunds-cash_supplier_payments
  AND cash_difference=actual_cash-expected_cash),
 CONSTRAINT daily_closings_discrepancy CHECK(
  cash_difference=0 OR (discrepancy_reason IS NOT NULL AND length(trim(discrepancy_reason)) BETWEEN 5 AND 500)),
 CONSTRAINT daily_closings_lifecycle CHECK (
  (status='submitted' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_reason IS NULL)
  OR (status='approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND reviewed_by<>submitted_by AND review_reason IS NULL)
  OR (status='rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND reviewed_by<>submitted_by AND review_reason IS NOT NULL AND length(trim(review_reason)) BETWEEN 5 AND 500))
);
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
CREATE INDEX daily_closings_review_idx ON daily_closings(status,branch_id,business_date);

CREATE TABLE daily_closing_events (
 id UUID PRIMARY KEY,
 closing_id UUID NOT NULL REFERENCES daily_closings(id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('submitted','approved','rejected')),
 actor_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 request_id UUID NOT NULL,
 occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE daily_closing_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION protect_daily_closing_snapshot() RETURNS trigger AS $$
BEGIN
 IF OLD.status<>'submitted' THEN
  RAISE EXCEPTION 'Reviewed cash closings are immutable';
 END IF;
 IF ROW(NEW.id,NEW.branch_id,NEW.business_date,NEW.opening_cash,NEW.cash_receipts,
        NEW.cash_reversals,NEW.cash_refunds,NEW.cash_supplier_payments,NEW.expected_cash,
        NEW.actual_cash,NEW.cash_difference,NEW.cash_movements_attested,
        NEW.discrepancy_reason,NEW.submitted_by,NEW.submitted_at)
     IS DISTINCT FROM
    ROW(OLD.id,OLD.branch_id,OLD.business_date,OLD.opening_cash,OLD.cash_receipts,
        OLD.cash_reversals,OLD.cash_refunds,OLD.cash_supplier_payments,OLD.expected_cash,
        OLD.actual_cash,OLD.cash_difference,OLD.cash_movements_attested,
        OLD.discrepancy_reason,OLD.submitted_by,OLD.submitted_at) THEN
  RAISE EXCEPTION 'Submitted cash closing snapshots cannot be edited';
 END IF;
 IF NEW.status NOT IN ('approved','rejected') THEN
  RAISE EXCEPTION 'Cash closing can only be reviewed once';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER daily_closings_lock AFTER UPDATE ON daily_closings
 FOR EACH ROW EXECUTE FUNCTION protect_daily_closing_snapshot();

CREATE OR REPLACE FUNCTION reject_closing_event_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Cash closing audit history is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER daily_closing_events_immutable BEFORE UPDATE OR DELETE ON daily_closing_events
 FOR EACH ROW EXECUTE FUNCTION reject_closing_event_mutation();
CREATE TRIGGER cash_opening_balances_immutable BEFORE UPDATE OR DELETE ON cash_opening_balances
 FOR EACH ROW EXECUTE FUNCTION reject_closing_event_mutation();

INSERT INTO permissions(id,code,name,description,scope,created_at,updated_at) VALUES
 ('20000000-0000-4000-8000-000000000067','finance.daily.read','View Daily Finance','Read aggregate daily finance snapshot for authorized branch.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000068','finance.closing.submit','Submit Cash Closing','Submit branch cash counts and attested cash movements.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000069','finance.closing.approve','Review Cash Closing','Approve/reject another operator cash closing.','GLOBAL',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000070','finance.opening.record','Authorize Opening Cash','Register documented beginning cash float in authorized clinic.','GLOBAL',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000071','finance.report.export','Export Daily Finance','Export audited non-personal branch finance report.','BRANCH',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000072','portal.balance.read','Read Own Balance','Read verified patient-specific finalized invoice balances.','OWN',NOW(),NOW()),
 ('20000000-0000-4000-8000-000000000073','portal.payments.read','Read Own Payments','Read own patient-safe payment allocations.','OWN',NOW(),NOW())
ON CONFLICT(code) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id,granted_at)
 SELECT r.id,p.id,NOW() FROM roles r JOIN permissions p
 ON (r.code='PERSONNEL' AND p.code IN
      ('finance.daily.read','finance.closing.submit','finance.report.export'))
 OR (r.code='DENTIST' AND p.code='finance.daily.read')
 OR (r.code='CLINIC_ADMINISTRATOR' AND p.code IN
      ('finance.closing.approve','finance.opening.record'))
 OR (r.code='PATIENT' AND p.code IN
      ('portal.balance.read','portal.payments.read'))
ON CONFLICT(role_id,permission_id) DO NOTHING;
