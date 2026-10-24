# Hosted Demo Fill/Reset — Safety Gate (2026-10-24)

**Status: PREPARED / NOT ENABLED.** Do not run Demo Fill/Reset, turn on Render flags, or update the database sentinel yet. This runbook intentionally only permits read-only verification.

## Confirmed
- Correct code branch `feature/single-clinic-cloud`, latest commit `2dc7da4`, live Render service `dental-presentation-demo-api`.
- Demo Fill/Reset is an authenticated destructive operation: deletes from `patients`, `treatments`, `appointments`, `attachments`, `treatment_payments`, and `public_id_counters` and queues private storage object cleanup.
- Backend requires all three: Render environment opt-in, matching Supabase project URL/connection identity, and enabled database guard row.
- Local DevSpace environment connects to **127.0.0.1/dental_presentation_test**, NOT hosted Supabase. It cannot verify the cloud data. Never run local integration fixture commands against the hosted database.
- Cloud Excel exports are **not a database or Storage recovery backup**. The cloud backup button is intentionally disabled.

## Step 1 — Manually verify dedicated Supabase project
In Supabase dashboard choose the dental-presentation project's **SQL Editor**, not the other dental V2/staging project. Confirm project name and project ref in the URL and the database connection info. Do not paste API keys or connection strings in chat.

Run these **read-only** queries in the selected project's SQL Editor:

```sql
SELECT current_database() AS database_name,
       (SELECT COUNT(*) FROM public.schema_migrations) AS migration_count,
       (SELECT COUNT(*) FROM public.patients) AS patients,
       (SELECT COUNT(*) FROM public.treatments) AS treatments,
       (SELECT COUNT(*) FROM public.appointments) AS appointments,
       (SELECT COUNT(*) FROM public.attachments) AS attachments,
       (SELECT COUNT(*) FROM public.treatment_payments) AS payments,
       (SELECT COUNT(*) FROM public.public_id_counters) AS id_counters;
```

```sql
SELECT project_ref, environment_name, enabled
FROM public.demo_environment_guard
WHERE singleton = TRUE;
```

```sql
SELECT bucket_id, COUNT(*)::integer AS object_count
FROM storage.objects
WHERE bucket_id = 'dental-demo-attachments'
GROUP BY bucket_id;
```

```sql
SELECT COUNT(*)::integer AS pending_storage_cleanup
FROM public.demo_storage_cleanup_queue;
```

A query error or missing table is a **failed gate**; do not enable demo controls. Summaries only: do not share patient rows or Storage object paths.

## Step 2 — Confirm data classifications
- Verify all existing records in the dedicated database are disposable fictional demonstration data, *including attachments and payment records*.
- Any real patient data, non-demo records, or uncertain record provenance is a stop.
- If counts are nonzero, Fill will **replace** them. Reset deletes **all** existing records, not just seeded records. Never use it without explicit data-loss approval.
- Verify that this dedicated Supabase project is not used by the separate V2 dental-record-system or any other app.

## Step 3 — Verify recovery
- Supabase plan's actual database backups/PITR availability, restoration method, and retention period.
- Independently recoverable backup of private Storage objects in `dental-demo-attachments`; database backups do not automatically guarantee object recovery.
- Verify backup age, consistency, access, and at least a restore rehearsal using a different disposable target. If data exists and recoverability is unproven, do not enable reset.

## Step 4 — Activation (NOT PERFORMED)
Only after all gates have passed and a separate explicit go-ahead:
1. Configure Render keys `CLOUD_DEMO_ENABLED=true`, `CLOUD_DEMO_ENVIRONMENT=dental-presentation-demo`, `CLOUD_DEMO_PROJECT_REF=<verified project ref>` securely. Do not share secrets.
2. Enable the precise singleton guard row for the *same* project ref only via an approved change; never enable an unrelated project's guard.
3. Redeploy as required and confirm authenticated `/api/runtime/status` returns `isDemoMode: true` before exposing the controls.
4. Do not click Demo Fill or Reset until the planned test record scope has been rechecked and separately approved.

**Current outcome:** hosted identity, patient counts, bucket objects and recovery safeguards are *not yet independently verified*. No destructive or production settings action is authorized by this runbook.
