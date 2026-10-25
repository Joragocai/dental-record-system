-- Track server-generated encrypted export metadata across browsers.
-- Neither the encrypted .drb bytes nor the passphrase are stored here.
-- No direct Supabase browser access: the authenticated Express API owns reads/writes.
CREATE TABLE public.cloud_backup_exports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename TEXT NOT NULL
    CHECK (filename ~ '^dental-demo-backup-[0-9]{8}-[0-9]{6}[.]drb$'),
  archive_bytes INTEGER NOT NULL
    CHECK (archive_bytes > 0 AND archive_bytes <= 50331648)
);

CREATE INDEX idx_cloud_backup_exports_user_recent
  ON public.cloud_backup_exports (generated_by, generated_at DESC, id DESC);

-- Anon/authenticated Supabase clients must not query this metadata directly.
-- The trusted PostgreSQL backend role accesses it through the authenticated API.
ALTER TABLE public.cloud_backup_exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cloud_backup_exports FROM PUBLIC;
