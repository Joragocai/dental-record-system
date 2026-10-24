# Hosted Backup Now — Controlled Activation Checklist

Status: Code prepared on `feature/single-clinic-cloud`; **hosted backup and destructive Demo Fill/Reset remain disabled**. No migration, hosted record edit, guard activation, or Reset/Fill performed.

## Verified local gates
- Encrypted .drb archive: AES-256-GCM + scrypt, row counts, SHA-256, private-file bytes, migration checksums.
- Backup is a read-only transaction; no app database writes by the archive service.
- Archive decryption and tampering rejection passed; a fictional end-to-end restore into the dedicated local `dental_presentation_test` PostgreSQL database **inside a ROLLBACK-only transaction** passed.
- Local test verified exact rows, patient/treatment/appointment/payment relationships, public ID counters, and private attachment bytes held in an isolated stand-in.
- Restoring files into real Supabase Storage or live demo has **NOT** been implemented or rehearsed. This remains an operational recovery limitation; do not claim a live Restore button exists.
- The backup-download feature currently supports a maximum encrypted archive size of 48 MiB; when too large it fails rather than falsely claiming a backup.
- Existing database and Storage backups from the provider, if any, are independent of this user-downloaded archive.

## Backup configuration (separate from Demo Fill/Reset)
1. In Supabase dashboard verify the exact project reference and hostname of the dedicated `dental-presentation-demo` project. Do not confuse it with the unrelated V2 Supabase project.
2. Confirm the Render service `dental-presentation-demo-api` is connected to that same project and that its `DATABASE_URL` points to the exact project, using trusted UI without copying connection strings or credentials into chat or git.
3. Only when the user approves the **backup-download deployment**: commit and push updated application, deploy updated Render backend and Vercel frontend from the same feature branch.
4. In the **correct** Render service's Environment section, add:
   - `CLOUD_BACKUP_DOWNLOAD_ENABLED=true`
   - `CLOUD_BACKUP_ENVIRONMENT=dental-presentation-demo`
   - `CLOUD_BACKUP_PROJECT_REF=<verified project ref>`
   Existing `DATABASE_URL`, `SUPABASE_URL`, SSL CA and secret settings remain unchanged.
5. Leave `CLOUD_DEMO_ENABLED=false` and do not add or enable any `public.demo_environment_guard` row yet.
6. After redeploy, sign in as the single authorized user; go to Settings → Backup. Choose a unique, strong passphrase (14–128 characters), download the encrypted archive, confirm the file exists outside Supabase and keep the passphrase safely *separate* from the file.
7. Before relying on cloud Backup Now, inspect the downloaded archive with the verifier using the correct passphrase. The server's snapshot operation checks migration and attachment inventories; a real hosted download is **not** yet verified.
8. Never commit .drb backups, passwords, keys, or real patient data. Archive is encrypted but sensitive. No Render disk persistence or automatic backup scheduling is provided.

## Demo Fill and Reset (NOT AUTHORIZED TO ENABLE IN THIS PHASE)
- Both independently require matching Render demo flags and an enabled singleton Supabase guard row.
- Both delete/replace active fictional clinical records. **Neither should delete .drb files saved to the owner's device**, but any *unbacked-up* manual edits are lost.
- Avoid turning on hosted controls until the separate demo activation gate, recorded data-use policy, and source project identity have been verified.
- `Demo Fill` seeds fresh fictional data; it does not restore an archived .drb snapshot.
- `Restore Backup` to hosted PostgreSQL and Storage remains a **future admin-only change** requiring a separately approved recovery implementation.

## Limitations to resolve before wider use
- No cloud auto-backups or automated restore button.
- No browser-side verification of completed download, only that download was initiated.
- Current PostgreSQL snapshot uses repeatable read + SHARE table locks and storage inventory checking; large databases and concurrent out-of-band Supabase Storage writes are unsupported.
- Real clinic/patient data must never be used in this presentation demo.
