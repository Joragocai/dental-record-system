# Hosted Dental Presentation — Recoverable Backup / Demo Reset Plan

Date: 2026-10-24
Project: `~/projects/dental-presentation` / dedicated `dental-presentation-demo` Supabase project.
Status: **DESIGN ONLY. NO BACKUP FEATURE ENABLED. NO DESTRUCTIVE CONTROLS ENABLED OR EXECUTED.**

## Owner's intended workflow

- **Backup Now:** save the current hosted demo state, without modifying or resetting active records.
- **Continue Working:** add/edit fictional patients, treatments, appointments, payments and attachments normally; no auto-reset.
- **Demo Reset:** delete *only the active demo dataset* (with guarded storage cleanup and database ID reset); do **not** delete independently saved backup archives.
- **Demo Fill:** create new fictional sample data after a reset (or replace active data only after a separate, explicit confirmation); it is **not** a restore of old manual edits.
- **Restore Backup:** optional, explicitly authorized recovery of a chosen snapshot; never automatic after Reset or Fill.

These operations must remain independently selectable. Backup should never invoke Demo Reset, and Demo Fill should never automatically restore an old snapshot.

## Verified current behavior (repository inspection)

- Hosted `GET /api/backup/status` reports `managedExternally: true` and last backup as unverified.
- Hosted `POST /api/backup` returns HTTP 501. Existing file/SQLite backup functionality is **not** a hosted PostgreSQL backup. No working hosted backup button exists yet.
- Hosted Demo Reset uses `mutateCloudDemo(operation:'clear')` and deletes rows from `public.treatment_payments`, `public.attachments`, `public.appointments`, `public.treatments`, `public.patients`, and `public.public_id_counters`. It restarts the payment identity and queues deletion of associated private files from `dental-demo-attachments`.
- Hosted Demo Fill uses `mutateCloudDemo(operation:'fill')` which first clears those same active clinical tables and then seeds fresh fictional data/attachments. Therefore **Fill also replaces any previously edited demo records**, even without Reset.
- The existing confirmation text in `client/src/components/DemoDataDock.jsx` incorrectly implies hosted Reset deletes saved exports and backup history. Once independent archives exist, update the warning to say backup archives remain untouched, and replace/reset active records are lost.
- The SQL guard row is currently missing (screenshots showed `guard_project_ref=NULL, guard_enabled=NULL`). Keep it absent/disabled while preparing backups.

## Architecture: recommended for the Supabase Free Plan

**Phase B1 — Manual recoverable snapshots first (no app code needed)**

1. Verify Supabase project reference and dedicated project isolation; do not use the separate V2 dental-record-system staging project. Use read-only record counts and Storage inventory.
2. Use a trusted workstation with authenticated Supabase CLI/pg_dump to capture a **logical database snapshot**. Source should include current application data in: `patients`, `treatments`, `appointments`, `treatment_payments`, `attachments`, and `public_id_counters`. Preserve sequence/identity state and the currently applied migration checksums. The project migrations in Git reconstruct the schema.
3. Download **actual private object bytes**, not only database metadata, from the `dental-demo-attachments` bucket via authenticated Supabase Storage API/CLI/S3-compatible client.
4. Include a manifest with timestamp (Asia/Manila), dedicated project ref, code revision, migration-version list, row counts, object count, expected file paths/sizes, SHA-256 checksums, and backup format version. Do not include DB passwords, service keys, Auth users, or Render secrets.
5. Verify every archived object's checksum and the manifest, and test restoring on a **separate disposable test database/project**, including patient/financial/appointment relations, private attachments and ID sequence continuity, *before* calling it recoverable.
6. Encrypt the archive, protect its password/keys separately, and keep copies **outside** the Supabase source project (e.g. encrypted local disk and a second owner-controlled offline/offsite location). Never commit backups to GitHub, store them in Render's ephemeral filesystem, or rely solely on a bucket in the project that may be lost.
7. Keep a practical set of several dated snapshots (suggestion: latest 5 on-demand checkpoints, plus 1 pre-demo checkpoint). Take one before major manual edits or Reset/Fill if those edits matter.

**Phase B2 — One-click Backup Now inside hosted app (future implementation, separate approval)**

- Add cloud-only **Backup Now** in Settings/Account (not to the Reset toolbar).
- Require the single allowlisted Supabase user, a configured isolated backup destination or secure streamed download, and verified project identity.
- Capture the six application tables + sequence state and private file bytes, with a manifest and integrity check. Read only; never `DELETE`, `TRUNCATE`, `ALTER`, or change Demo guard settings in this flow.
- Use a consistent PostgreSQL snapshot plus a file inventory check; either prevent concurrent writes during snapshotting or fail and retry if the dataset changes before completion. File bytes and PG rows are not part of one distributed transaction.
- Ensure archive is downloaded to the user's device or persisted offsite independently. Avoid logging clinical rows, storage paths, credentials or backup payloads.
- Display **Backup successful** only after the entire archive has been written and verified at its destination; show timestamp/size/object counts and explicit location.
- Optionally allow automatic scheduled snapshots to independent storage later, **only** after verifying provider costs/retention and securing credentials. Supabase Free does not supply automatic managed daily backups.

**Phase B3 — Restore mechanism (future implementation; restricted and separately confirmed)**

- Treat Restore as a privileged, high-risk operation, independent of Reset and Fill.
- First validate archive format/version, destination project ref, schema migration compatibility, encryption/password, checksums and all Storage objects.
- Restore into an empty isolated target in a rehearsed procedure; verify relational links, payments/reversals, attachments and public/identity sequences.
- Only then propose restoring into the live demo project after explicit confirmation and a fresh safety snapshot. Never restore into separate V2 or overwrite Auth, secrets, provider policies, migration history or the Demo guard.
- A user may choose to keep the demo empty after Reset, click Demo Fill for a fresh seed, or **separately** restore a saved snapshot. No automatic post-reset restoration.

## UI semantics for final implementation

| Action | Clinical data | Private attachments | Independent backups |
|---|---|---|---|
| Backup Now | Unchanged | Unchanged | Creates new snapshot |
| Continue Working | Changed as user edits | Changed as user edits | Unchanged |
| Demo Reset | Cleared | Associated objects removed/queued | Preserved |
| Demo Fill | Replaced with fictional seed | Replaced with seed files | Preserved |
| Restore Snapshot | Replaced with selected snapshot *after approval* | Restored from selected snapshot | Preserved |

In the Reset confirmation warn: **'This permanently clears all active fictional patients, treatments, payments, appointments and attachments in the dedicated demo project. Saved backup archives outside the demo data remain available. Continue?'**

In the Fill confirmation warn: **'This replaces the current active demonstration records with a new fictional dataset. Manual changes that have not been backed up will be lost. Continue?'**

## Gates before any Demo Fill/Reset activation

- [ ] Owner's declared all-fictional/disposable-data policy (approved 2026-10-24).
- [x] Initial screenshot counts: clinical rows 0; private files 0; pending cleanup 0; guard row absent, migrations 7.
- [ ] Independently verify *exact* Supabase project ref against Render/database connection without exposing credentials.
- [ ] Implement and verify full **database + private attachment** backup/restore procedure (at least one disposable restore rehearsal) if backup recovery is required.
- [ ] Align destructive action confirmation text with independent backup survival.
- [ ] Only with separate approval, provision guard row and Render demo flags and verify new status; **do not run Reset or Fill as part of preparation**.

## Source links
- https://supabase.com/docs/guides/platform/backups — Free Plan recommends CLI offsite backups; paid plans offer managed daily backups; database snapshots exclude Storage object bytes.
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore — documented CLI logical database dump and restore, Storage migration.
- https://supabase.com/docs/guides/storage/management/download-objects — methods to download private Storage object bytes.
