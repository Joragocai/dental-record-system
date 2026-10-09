CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  recipient_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_type TEXT,
  source_id UUID,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  request_id UUID,
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT notifications_category_allowed CHECK (
    category IN ('appointment', 'account', 'security', 'system')
  ),
  CONSTRAINT notifications_event_type_not_blank CHECK (length(trim(event_type)) > 0),
  CONSTRAINT notifications_event_type_length CHECK (length(event_type) <= 100),
  CONSTRAINT notifications_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT notifications_title_length CHECK (length(title) <= 200),
  CONSTRAINT notifications_body_not_blank CHECK (length(trim(body)) > 0),
  CONSTRAINT notifications_body_length CHECK (length(body) <= 2000),
  CONSTRAINT notifications_source_type_not_blank CHECK (
    source_type IS NULL OR length(trim(source_type)) > 0
  ),
  CONSTRAINT notifications_source_type_length CHECK (
    source_type IS NULL OR length(source_type) <= 50
  ),
  CONSTRAINT notifications_source_pair CHECK (
    (source_type IS NULL AND source_id IS NULL)
    OR (source_type IS NOT NULL AND source_id IS NOT NULL)
  ),
  CONSTRAINT notifications_dedupe_key_not_blank CHECK (length(trim(dedupe_key)) > 0),
  CONSTRAINT notifications_dedupe_key_length CHECK (length(dedupe_key) <= 255),
  CONSTRAINT notifications_read_after_create CHECK (
    read_at IS NULL OR read_at >= created_at
  )
);

CREATE INDEX IF NOT EXISTS notifications_recipient_time_idx
  ON notifications (recipient_user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON notifications (recipient_user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS notifications_request_time_idx
  ON notifications (request_id, created_at DESC)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_source_idx
  ON notifications (source_type, source_id, created_at DESC)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT notification_preferences_category_allowed CHECK (
    category IN ('appointment', 'account', 'security', 'system')
  ),
  CONSTRAINT notification_preferences_user_category_unique UNIQUE (user_id, category),
  CONSTRAINT notification_preferences_updated_after_create CHECK (
    updated_at >= created_at
  )
);

CREATE INDEX IF NOT EXISTS notification_preferences_user_idx
  ON notification_preferences (user_id, category);

CREATE TABLE IF NOT EXISTS email_delivery_logs (
  id UUID PRIMARY KEY,
  notification_id UUID REFERENCES notifications(id) ON DELETE RESTRICT,
  recipient_user_id UUID REFERENCES app_users(id) ON DELETE RESTRICT,
  recipient_patient_id UUID REFERENCES patients(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  event_type TEXT NOT NULL,
  template_key TEXT NOT NULL,
  source_type TEXT,
  source_id UUID,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  last_error_code TEXT,
  request_id UUID,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT email_delivery_logs_exactly_one_recipient CHECK (
    (recipient_user_id IS NOT NULL AND recipient_patient_id IS NULL)
    OR (recipient_user_id IS NULL AND recipient_patient_id IS NOT NULL)
  ),
  CONSTRAINT email_delivery_logs_category_allowed CHECK (
    category IN ('appointment', 'account', 'security', 'system')
  ),
  CONSTRAINT email_delivery_logs_event_type_not_blank CHECK (length(trim(event_type)) > 0),
  CONSTRAINT email_delivery_logs_event_type_length CHECK (length(event_type) <= 100),
  CONSTRAINT email_delivery_logs_template_key_not_blank CHECK (length(trim(template_key)) > 0),
  CONSTRAINT email_delivery_logs_template_key_length CHECK (length(template_key) <= 120),
  CONSTRAINT email_delivery_logs_source_type_not_blank CHECK (
    source_type IS NULL OR length(trim(source_type)) > 0
  ),
  CONSTRAINT email_delivery_logs_source_type_length CHECK (
    source_type IS NULL OR length(source_type) <= 50
  ),
  CONSTRAINT email_delivery_logs_source_pair CHECK (
    (source_type IS NULL AND source_id IS NULL)
    OR (source_type IS NOT NULL AND source_id IS NOT NULL)
  ),
  CONSTRAINT email_delivery_logs_status_allowed CHECK (
    status IN ('pending', 'processing', 'failed', 'sent', 'abandoned')
  ),
  CONSTRAINT email_delivery_logs_attempt_count_valid CHECK (attempt_count >= 0),
  CONSTRAINT email_delivery_logs_provider_message_id_not_blank CHECK (
    provider_message_id IS NULL OR length(trim(provider_message_id)) > 0
  ),
  CONSTRAINT email_delivery_logs_provider_message_id_length CHECK (
    provider_message_id IS NULL OR length(provider_message_id) <= 255
  ),
  CONSTRAINT email_delivery_logs_last_error_code_not_blank CHECK (
    last_error_code IS NULL OR length(trim(last_error_code)) > 0
  ),
  CONSTRAINT email_delivery_logs_last_error_code_length CHECK (
    last_error_code IS NULL OR length(last_error_code) <= 100
  ),
  CONSTRAINT email_delivery_logs_dedupe_key_not_blank CHECK (length(trim(dedupe_key)) > 0),
  CONSTRAINT email_delivery_logs_dedupe_key_length CHECK (length(dedupe_key) <= 255),
  CONSTRAINT email_delivery_logs_updated_after_create CHECK (
    updated_at >= created_at
  ),
  CONSTRAINT email_delivery_logs_attempt_after_create CHECK (
    last_attempt_at IS NULL OR last_attempt_at >= created_at
  ),
  CONSTRAINT email_delivery_logs_processing_lease_consistent CHECK (
    (status = 'processing' AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease_expires_at IS NULL)
  ),
  CONSTRAINT email_delivery_logs_lease_after_create CHECK (
    lease_expires_at IS NULL OR lease_expires_at >= created_at
  ),
  CONSTRAINT email_delivery_logs_sent_after_create CHECK (
    sent_at IS NULL OR sent_at >= created_at
  ),
  CONSTRAINT email_delivery_logs_sent_state_consistent CHECK (
    (status = 'sent' AND sent_at IS NOT NULL)
    OR (status <> 'sent' AND sent_at IS NULL)
  ),
  CONSTRAINT email_delivery_logs_failure_state_consistent CHECK (
    status NOT IN ('failed', 'abandoned') OR last_error_code IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS email_delivery_logs_dispatch_idx
  ON email_delivery_logs (status, next_attempt_at, created_at, id)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS email_delivery_logs_processing_lease_idx
  ON email_delivery_logs (lease_expires_at, created_at, id)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS email_delivery_logs_user_time_idx
  ON email_delivery_logs (recipient_user_id, created_at DESC)
  WHERE recipient_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_delivery_logs_patient_time_idx
  ON email_delivery_logs (recipient_patient_id, created_at DESC)
  WHERE recipient_patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_delivery_logs_request_time_idx
  ON email_delivery_logs (request_id, created_at DESC)
  WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_delivery_logs_source_idx
  ON email_delivery_logs (source_type, source_id, created_at DESC)
  WHERE source_type IS NOT NULL AND source_id IS NOT NULL;
