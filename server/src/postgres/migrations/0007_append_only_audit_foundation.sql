CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  actor_auth_user_id UUID,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT audit_events_action_not_blank CHECK (length(trim(action)) > 0),
  CONSTRAINT audit_events_target_type_not_blank CHECK (length(trim(target_type)) > 0),
  CONSTRAINT audit_events_outcome_allowed CHECK (outcome IN ('SUCCESS', 'FAILURE')),
  CONSTRAINT audit_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS audit_events_actor_user_time_idx
  ON audit_events(actor_user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_target_idx
  ON audit_events(target_type, target_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_action_time_idx
  ON audit_events(action, occurred_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx
  ON audit_events(occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION reject_audit_event_mutation();
