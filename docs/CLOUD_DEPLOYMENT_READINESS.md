# Dental Presentation: single-clinic cloud deployment checklist

## Readiness gates
- Development branch: `feature/single-clinic-cloud`. Do not deploy an unrelated V1/V2 branch.
- Preserve all existing uncommitted files; never reset or force-push the branch.
- Test with `npm run build --prefix client` and `node --test server/src/**/*.test.js`.
- Local disposable PostgreSQL: `PG_INTEGRATION_TEST=1 node --env-file=server/.env --test server/src/db/postgres/integration.test.js server/src/routes/postgresClinical.integration.test.js`.
- Demo lifecycle **local only**: `PG_DEMO_INTEGRATION_TEST=1 node --env-file=server/.env --test server/src/demo/cloudDemo.integration.test.js`. This deliberately mutates the dedicated empty `dental_presentation_test` DB. NEVER use cloud credentials for this command.
- Migration 0005 includes a disabled database sentinel and cleanup queue. It does **not** enable Demo Fill/Reset by itself.

## Render backend (manual provider setup)
- Repository: correct repository and branch only. Root directory at repository root.
- Build command: `npm ci`.
- Start command: `npm run start:cloud --workspace server`.
- Node version: use tested Node 22+.
- `DATABASE_URL`: isolated Supabase **dental-presentation-demo** session pooler URL, secret.
- `PG_SSL_MODE=require`: configure server TLS trust and CA verification as tested; no insecure SSL bypass.
- `NODE_ENV=production`.
- `SUPABASE_URL`: dedicated HTTPS project URL.
- `SUPABASE_SECRET_KEY`: backend only; never in Vercel.
- `SUPABASE_ALLOWED_USER_ID`: single allowlisted Supabase Auth UUID.
- `CLOUD_ALLOWED_ORIGINS`: exact HTTPS Vercel site origin.
- `PORT`: Render sets automatically.
- Run/check staged migrations separately from the request server. Do not auto-migrate on startup.
- Check unauthenticated `GET /api/health` and denied `GET /api/patients` before any user sign-in.

## Vercel frontend (manual provider setup)
- Repository/branch: this cloud branch only.
- Root directory: `client`, build command `npm run build`, output directory `dist`.
- `VITE_API_BASE_URL`: `https://YOUR-RENDER-HOST/api` (HTTPS).
- `VITE_SUPABASE_URL`: dedicated Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: browser-safe project publishable key.
- Never expose `SUPABASE_SECRET_KEY` or `DATABASE_URL` in Vite settings.

## Hosted demo controls
- Disabled by default. Requires ALL: authenticated allowlisted user, exactly matched environment flags, database guard sentinel.
- `CLOUD_DEMO_ENABLED=true`, `CLOUD_DEMO_ENVIRONMENT=dental-presentation-demo`, `CLOUD_DEMO_PROJECT_REF` matching the Supabase project reference.
- A database administrator must enable the sentinel **only after** confirming the dedicated demo project contains no real clinic data and the reset scope is approved. Do not enable automatically.
- Always separately verify private Storage bucket `dental-demo-attachments` and file-size/MIME allowances.
- Hosted Fill/Reset and attachments still require end-to-end authorization, failure recovery, and provider-configuration verification.

## Backups and exports
- The cloud Excel exports are not a database backup or disaster-recovery solution.
- Cloud manual backup button intentionally remains disabled; do not reuse SQLite backups.
- Set up separately verified Supabase database backup/PITR (depending on plan) and private Storage recovery, with retention and restore rehearsal.
- Do not claim successful backup until both restore paths have been tested with fictional data.

## Final validation before approval
- Auth: approved user signs in, other user denied, expired token rejected.
- Patient CRUD, treatment, appointments, money ledger and balance report.
- Attachment upload, image preview, authorized download and deletion; verify no public object exposure.
- Fictional Fill -> edit -> Reset -> Fill; no unintended Storage objects or orphan records.
- Excel patient/treatment/full-record export and authenticated download.
- Responsive mobile/table views, print history and logout.
- Production logs must never contain passwords, session tokens, DB URLs, secret keys, or patient file contents.
- No direct localhost API or Socket.IO requests in cloud mode.
