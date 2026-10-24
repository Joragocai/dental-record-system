# Dental Presentation: single-clinic cloud deployment checklist

## Current branch and deployment order (2026-10-24)
- Pushed branch: `feature/single-clinic-cloud`; verified remote commit `ab1923e` before these preparation changes.
- New hosting preparation files are not yet committed: `client/vercel.json` for browser deep-link refresh, and root `render.yaml` for a disabled-by-default Render blueprint.
- The backend now checks that every `public.schema_migrations` filename and checksum matches the application manifest before serving requests. **It never automatically applies migrations during startup.**
- First run all migrations `0001`–`0007` in the **dedicated Supabase demo** database through a separately approved procedure after checking the project identity and backup policy. Do not run local destructive tests against Supabase.
- Confirm the hosted Supabase signing key supports RS256/ES256 and configure only the one allowlisted authorized user.
- Configure the private `dental-demo-attachments` bucket and supported file sizes/MIME types. Storage access is server-side; never make the bucket public.
- Prepare a trustworthy TLS CA certificate for Render's Postgres connection. `NODE_EXTRA_CA_CERTS` requires an actual readable certificate file in the runtime, not the developer-only ignored file path.
- Commit these preparation files only after review; configure Render/Vercel with secrets through their dashboards; keep auto deployment disabled until approved.
- After deploying, verify the real hosted auth, clinical workflow, attachments, exports, and demo controls before considering the demo ready.

## Phase 05 — Repository and hosting preflight results (2026-10-24)
- Verified local HEAD and GitHub remote both at `ab1923e` on `feature/single-clinic-cloud`; previous phase 04 files remain uncommitted.
- Verified `.gitignore` excludes `.env`, `.env.local`, local PostgreSQL attachments, and CA download paths; no tracked local attachments were found.
- Hosted client helpers use authenticated Axios downloads and previews; the remaining localhost URLs are restricted to SQLite mode or explanatory UI text. Cloud Socket.IO is intentionally disabled, with balance data refreshed on focus.
- SPA routing rewrite is in `client/vercel.json`; Render blueprint in root `render.yaml` has `autoDeployTrigger: off` and no database or Storage credentials in source.
- Secrets must be provided manually and verified in the hosting dashboard. Supabase migrations 0006–0007 are not yet applied to the hosted database; backend startup verification will reject that schema until they are.
- **Preflight release gate:** do not deploy or enable hosted Demo Fill/Reset until Supabase migration safety, Render SSL trust, origin restriction, and backup/recovery readiness are verified.

## Phase 07 — Render account inspection (2026-10-24)
- Render workspace verified. The only existing Render web service is `dental-record-staging-api`, on the unrelated `refactor/v2-cloud-migration` branch. **Do not repurpose, resume, or deploy it for this presentation project.**
- A separate service `dental-presentation-demo-api` is not yet created. Keep automatic deploys disabled; creation and any initial deployment require explicit approval.
- Current GitHub branch `feature/single-clinic-cloud` is at `ab1923e`; hosting configurations and migration-checking code remain uncommitted, and the remote does not yet include them. A Git commit/push is needed before creating/deploying a service using that source.
- Hosted Supabase migration checks passed (7/7); the authorized Auth user is present. The private Storage bucket size is now 20 MiB, matching the backend. Hosted bucket MIME allowlist still excludes `.doc` and `.docx`; update it or explicitly restrict the application to the five allowed MIME types before attachment testing.
- Pending new Render service setup: supply `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_ALLOWED_USER_ID`, `CLOUD_ALLOWED_ORIGINS` and trusted `PG_CA_CERT_PEM` through secure settings. Never paste secrets into chat, Git, logs, or source. `CLOUD_DEMO_ENABLED=false` until the separately approved demo/reset phase.
- Do not claim a hosted API is deployed or healthy until the new service exists and actual external health/auth tests pass.

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
- `PG_CA_CERT_PEM`: set the trusted Supabase CA in Render secret environment variables (PEM text, or literal `\\n` line separators); this is passed to `pg` with `rejectUnauthorized: true`. Obtain the correct CA from Supabase before enabling the service. Never commit the PEM or use `NODE_TLS_REJECT_UNAUTHORIZED=0`.
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
