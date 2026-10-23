-- Hosted demo controls remain disabled until an administrator deliberately
-- provisions one guard row in the isolated demonstration database.
-- Applying this migration alone MUST NOT activate destructive features.
CREATE TABLE public.demo_environment_guard (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton IS TRUE),
  project_ref TEXT NOT NULL CHECK (project_ref ~ '^[a-z0-9-]{6,40}$'),
  environment_name TEXT NOT NULL CHECK (environment_name = 'dental-presentation-demo'),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Storage operations cannot share PostgreSQL transactions. Persist deferred
-- deletion intent atomically with clinical rows so failures can be retried.
CREATE TABLE public.demo_storage_cleanup_queue (
  file_path TEXT PRIMARY KEY,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempted_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
