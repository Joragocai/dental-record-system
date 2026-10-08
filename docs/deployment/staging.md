# Phase 11 — Early Staging

Status: **Repository staging foundation implemented; provider provisioning and live staging validation pending.** This is NOT production authorization.

## Goal and constraints

Establish an isolated HTTPS staging environment to exercise the already-implemented V2 authentication, account activation, authorization/RBAC, audit review, PostgreSQL migration, and private attachment flows using fictional data only. Phase 11 does **not** cut over the legacy Patient/Treatment/Appointment/finance UI or authorize real patient data. The `v1-local-stable` reference is unchanged.

**Approved Phase 11 hosting:** Vercel hosts the React/Vite static frontend; Render hosts the long-running Express API; a **dedicated staging Supabase project** provides PostgreSQL, Auth, and private Storage. Invitation and recovery email redirects are restricted to the Vercel frontend origin. The application must never reuse development or production database, Auth project, Storage bucket, or secrets.

## Repository staging behavior

- `DENTAL_SERVER_ENV=staging` is mandatory for the staging API; set `NODE_ENV=production` on the hosting platform.
- `npm run start:hosted` at the repository root starts the Express server without requiring a local `.env` file; the hosting platform injects environment secrets.
- Hosted Express binds to `HOST` or `0.0.0.0` and `PORT` or `3002`, validates hosted configuration before listening, and does **not** load the local SQLite routes/database or automatic backup scheduler.
- `CORS_ALLOWED_ORIGINS` must be exact HTTPS frontend origins (for example `https://clinic-staging.example.test`). Denied origins receive 403; there is no wildcard.
- `GET /api/health` is a lightweight process liveness check and is the Render platform health-check path. `GET /api/ready` is an explicit post-deploy database/schema readiness check: it returns `200 {"status":"ready"}` only when PostgreSQL is accessible and all locally known migrations are applied with matching checksums; otherwise it returns generic `503 {"status":"unavailable"}`. Readiness shares one database pool (one connection), coalesces concurrent requests, caches success for 15 seconds/failure for 5 seconds, and uses the configured database connection/statement timeouts rather than a forced 2-second cross-region limit.
- Hosted HTTP routes are limited to /api/health, /api/ready, and protected /api/auth, /api/staff-accounts, /api/audit-events and /api/attachments. Unauthenticated legacy /api/runtime, /api/dashboard, /api/patients, /api/treatments, /api/appointments, /api/export and /api/backup are not mounted.
- Production-built frontend exposes only /login, /forgot-password, /reset-password, /activate-account and protected /auth/account. It does not expose the SQLite-backed clinical UI. This is an **authentication/authorization foundation demonstration**, not a functional cloud clinic application.
- Staging browser config requires `VITE_API_BASE_URL` to be an absolute HTTPS URL ending in `/api`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`. When `VITE_APP_ENV=staging`, the Vite build requires build-only `STAGING_SUPABASE_PROJECT_REF` matching the staging Supabase URL and verifies the approved Render API origin. Never pass server secrets as `VITE_*` variables.
- App-specific SQL migrations are not applied automatically at process startup.

## Manual gate A: create and configure the staging Supabase project

**Do this only after all local Phase 11 validation passes.** Do not change the development Supabase project.

1. In the Supabase dashboard, create a **new project** named for staging (for example `dental-record-system-staging`), under the correct organization/region. Select and securely store a **new, unique** database password.
2. In the new staging project's connection details, locate a PostgreSQL **connection string** suitable for the hosted API (direct or session pooler as supported by your hosting environment). Enter it only in the hosting platform's secret/environment settings as `DATABASE_URL`, never in Git or chat. Ensure SSL certificate verification can work with `DATABASE_SSL_MODE=require`.
3. In **Project Settings / API Keys**, locate the staging project URL, its publishable key and its **server-only** secret key. The browser receives only the URL and publishable key; the API receives URL, publishable key, and secret key. Do not paste the secret into chat, logs, commits, or public screenshots.
4. Keep the staging attachment bucket **private**. Use a distinct name such as `dental-attachments-staging`; the existing server-only `bootstrap:attachments-storage` CLI can create/verify that bucket after the staging database and project identity are confirmed. Never enable public Storage access.
5. Once the staging frontend HTTPS URL is known, in **Authentication > URL Configuration**, set its Site URL and allowlisted redirect URLs for `/activate-account` and `/reset-password`. Set `STAFF_INVITE_REDIRECT_URL` to that exact HTTPS frontend `/activate-account` URL. Verify invitation/recovery emails are allowed in the staging project. Do not use live patient addresses.
6. Keep staging identities, Auth records, audit events, attachments, keys, and database separate from development and production. Use only fictional staff/email and patient data. Do not enable any public sign-up features beyond the authorized managed-account workflow.

**Gate A completion:** the dedicated project exists, no real data was imported, its secrets are stored only in the hosting provider or developer's ignored local environment, and project identity has been checked against the intended staging target.

## Manual gate B: deploy Vercel frontend and Render API (approved providers)

Do not perform this gate before the user approves the Phase 11 Git commit and push. **The project is not hosted yet.** The repository provides `client/vercel.json` for explicit authentication-page SPA rewrites and root `render.yaml` for the Render API Blueprint. Neither file contains credentials or deploys automatically by being present in Git.

**Stage B1 — Vercel frontend**
1. Import the GitHub repository into Vercel. Select **branch `refactor/v2-cloud-migration`** for the staging deployment, rather than the stable V1 branch. Vercel branch/production-domain settings must be verified manually before assuming which deployment URL is stable; do not associate production clinic domains.
2. Set **Root Directory = `client`**. This is important because `client/vercel.json` is relative to that project root. Framework preset: **Vite**; Build Command: `npm run build`; Output Directory: `dist`. For npm workspaces, if a package-install issue occurs, use root-level install with the lockfile rather than committing an unrelated nested lockfile; document the effective commands before deploying.
3. Set the frontend's **staging environment variables**: `VITE_APP_ENV=staging`, `STAGING_SUPABASE_PROJECT_REF=<staging-project-ref>` (build-only identity check), `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from that exact staging project, and `VITE_API_BASE_URL=https://dental-record-staging-api.onrender.com/api` after verifying Render's assigned hostname. The Vite build fails on missing/mismatched staging identity, localhost, or an unapproved API host. Only `VITE_` values are browser-public. **Never configure** `DATABASE_URL`, `SUPABASE_SECRET_KEY`, or CA/private keys in Vercel.
4. Provision a stable HTTPS frontend URL **after confirming the intended Render API hostname**. A staging frontend build now intentionally fails if its API destination or Supabase project identity is unknown or mismatched; do not bypass that guard for a placeholder build. If necessary, configure the Render service first to obtain its name and HTTPS endpoint, then configure Vercel and finally complete the cross-service URL settings. Ensure direct navigation to `/login`, `/auth/account`, `/activate-account` and `/reset-password` returns the frontend HTML, not a 404.

**Stage B2 — Render Express API**
1. In Render, create a **Blueprint** from the same GitHub repository using the root `render.yaml`, or equivalently configure a Node Web Service manually. Select only the staging branch. Do not connect the V1 branch, auto-run SQL migrations, or enable production deployment. Review the Blueprint before creating any resource.
2. The Blueprint fixes `NODE_ENV=production`, `DENTAL_SERVER_ENV=staging`, `DATABASE_SSL_MODE=require`, `ALLOW_PRODUCTION_DB_COMMANDS=false`, `SUPABASE_ATTACHMENT_BUCKET=dental-attachments-staging`, `NODE_VERSION=24`, `buildCommand=npm ci`, `startCommand=npm run start:hosted` and `healthCheckPath=/api/health`. Service root is the **repository root** (npm workspace dependencies and migrations require that root). Manual service setup should use these same values.
3. Under **Environment**, add the staging-only values flagged `sync: false` by the Blueprint: `CORS_ALLOWED_ORIGINS=https://<vercel-staging-frontend-origin>`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `STAFF_INVITE_REDIRECT_URL=https://<vercel-staging-frontend-origin>/activate-account`. Store only secrets in Render environment settings, never in the repository.
4. Because the verified staging Session pooler required the staging Supabase CA certificate, upload that **public CA certificate** as a Render **Secret File** named `dental-staging-ca.crt` (Render mounts it at `/etc/secrets/dental-staging-ca.crt`). Do **not** upload `.env.staging` or any credential file as a secret file. `DATABASE_SSL_CA_FILE` in the Blueprint refers to that exact mounted location. Check the certificate is for the staging Supabase connection and keep TLS verification enabled.
5. Once the frontend origin and secret values are configured, deploy the API. Render uses `/api/health` so a temporary external database outage does not cause the platform to repeatedly fail/restart an otherwise healthy Node service. After the service is live, explicitly require `/api/ready` to return 200 before declaring staging usable; if it returns 503, inspect the safe `[readiness] probe failed category=...` log and fix the database/TLS/auth cause without disabling verification. If readiness is 503, inspect protected Render logs, validate the staging certificate/connection and database identity, and **do not** disable TLS verification or move to patient data.
6. Set final Vercel `VITE_API_BASE_URL` to Render's HTTPS origin plus `/api`, redeploy the Vercel frontend, then configure Supabase staging **Authentication > URL Configuration** with the Vercel Site URL and exact `/activate-account` and `/reset-password` redirect URLs. Confirm Render's `CORS_ALLOWED_ORIGINS` and `STAFF_INVITE_REDIRECT_URL` use the same Vercel origin. Staging credentials and authentication records stay separate from development and production.

**API service (Render)**
- Root/build context: repository root with Node 24.x supported; install using lockfile (`npm ci`); launch using `npm run start:hosted`.
- `NODE_ENV=production`, `DENTAL_SERVER_ENV=staging`, `CORS_ALLOWED_ORIGINS=https://<staging-frontend-origin>`.
- `DATABASE_URL` (staging), `DATABASE_SSL_MODE=require`; `ALLOW_PRODUCTION_DB_COMMANDS=false` for the *long-running API*.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` for the **staging** project.
- `SUPABASE_ATTACHMENT_BUCKET=dental-attachments-staging`.
- `STAFF_INVITE_REDIRECT_URL=https://<staging-frontend-origin>/activate-account`.
- Optional tuning: `AUTH_JWT_AUDIENCE=authenticated`, PGPOOL and request timeouts, `PGAPP_NAME=dental-v2-staging`.
- Platform typically sets `PORT`; `HOST=0.0.0.0` is appropriate for hosted Express. Do not expose the management database port to public traffic.

**Static frontend service (Vercel)**
- Vercel root directory `client`; build `npm run build`, publish `dist` (equivalent to repository path `client/dist`).
- `VITE_APP_ENV=staging`, `STAGING_SUPABASE_PROJECT_REF=<staging-project-ref>` (build-only identity check), `VITE_SUPABASE_URL=https://<staging-project-ref>.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=<staging-public-key>`.
- `VITE_API_BASE_URL=https://dental-record-staging-api.onrender.com/api` (expected Render staging service hostname and HTTPS required; no localhost fallback). If the actual Render service URL is different, review the name and deliberately update the allowlist guard after inspection rather than turning the guard off.
- `client/vercel.json` defines explicit `/login`, `/forgot-password`, `/reset-password`, `/activate-account` and `/auth/account` rewrites to `/index.html`. It does not forward `/api` or expose the legacy clinical pages.
- After choosing host-generated URLs, set them consistently in CORS, frontend API settings and Supabase Auth redirects, then rebuild/redeploy the static site.

## Controlled database and Storage setup

The staging DB is initially empty. Migration application is a **separate manual approval gate**, never part of normal hosted startup.

1. Copy `server/.env.staging.example` to **gitignored** `server/.env.staging` and replace placeholders with the new staging Supabase URL and connection string from the Dashboard **Connect** dialog. Do not modify `server/.env` used for development. For IPv4-only connections choose the **Session pooler** (port 5432); copy its host and `postgres.<project-ref>` username exactly rather than guessing. Set `ALLOW_PRODUCTION_DB_COMMANDS=false`. From the repository root, run **read-only** `npm run db:migrate:status:staging`. The script verifies the database connection identifies the same Supabase project as `SUPABASE_URL` before connecting. Confirm displayed target host/project and the existing local migration filenames 0001–0010.
   If the read-only check reports `self-signed certificate in certificate chain`, do **not** set `DATABASE_SSL_MODE=no-verify` or `NODE_TLS_REJECT_UNAUTHORIZED=0`. Instead open the **staging** Supabase Dashboard > Project Settings > Database > SSL Configuration > Download Certificate, save the provider-issued PEM CA certificate outside this Git repository on the WSL filesystem, and add `DATABASE_SSL_CA_FILE=/absolute/wsl/path/to/supabase-ca.crt` to ignored `server/.env.staging`. Run the same read-only status check again. The Node `pg` connection retains `rejectUnauthorized: true` and uses that CA to validate the server certificate. The CA file must be installed by the deployer in the hosted runtime before using this setting there.
2. Only after the specific staging target is verified, authorize one controlled staging migration via `node --env-file=.env.staging --import tsx src/postgres/cli/migrate.ts` from `server/`, with `ALLOW_PRODUCTION_DB_COMMANDS=true` **for that command only** (do not permanently edit the staging env file to true). The option is purposefully not enabled in the deployed API runtime. Do not point at the development or production project.
3. Re-run read-only `db:migrate:status` and require all migrations APPLIED and matching checksums.
4. Verify/create the designated **private staging** Storage bucket with `npm run bootstrap:attachments-storage:staging`. This dedicated CLI verifies that `DATABASE_URL` belongs to the same staging Supabase project as `SUPABASE_URL`, requires the staging environment and exact `dental-attachments-staging` bucket, creates it only if missing, and rechecks its private policy. **Verified completed on October 8, 2026.** Do not use the development bucket.
5. Use the existing branch/owner bootstrap CLIs only after examining the target and confirming the target is staging; creation of accounts and invitations is a separate explicit action. No automatic test-account bootstrap on server startup.
6. Check `GET /api/ready` returns 200 after migrations; no sensitive database or environment details should appear in its response.

## Fictional-data smoke tests

- From an approved staging origin: /api/health returns 200, /api/ready returns 200 after schema setup; wrong-origin browser requests are blocked.
- Legacy /api/patients, /api/treatments, /api/appointments, /api/export, /api/backup, /api/runtime are not available.
- Unauthenticated access to /api/auth/session, /api/staff-accounts, /api/audit-events and /api/attachments is denied.
- Fictional owner activation from the staging Auth email redirect and login are verified; recovery redirects return to the staging static site.
- Authenticated session is validated by Express; test authorized and unauthorized role/branch access, especially Clinic Administrator-only audit review/export and no System Administrator clinical access.
- With fictional V2 PostgreSQL patient/branch records established through approved controlled tools, test private attachment upload intent, completion, signature verification, download URL, audit trail and soft deletion. An issued URL is NOT proof of actual download.
- Confirm no SQLite file, uploads, backups or other local runtime artifacts are generated by the hosted API; do not use real patient data.
- All staging tests, typechecks, build, environment isolation, and negative tests pass before proceeding to further phases.

## Local QA before manual gates

Run `npm run typecheck`, `npm run build`, `npm run test:staging`, `npm run test:auth --workspace server`, `npm run test:attachments`, `npm run test:audit`, and relevant regression suites. PostgreSQL live integration tests require a separate dedicated test database and are expected to skip when credentials are not configured. Do not interpret skipped live tests as passes.

## Deferred

- Full protected clinical UI/route cutover, Patient/Treatment/Appointment workflow deployment, staff-management GUI.
- Complete operational backup/restore and malware scanning, advanced monitoring and security hardening.
- Production deployment, real patient data, general public registration, unrelated phases 12–21.
- Docker, broad CI/CD and production-provider configuration; the user has specifically approved Vercel frontend + Render API for Phase 11 staging, so only the necessary `client/vercel.json` and `render.yaml` are included.

**Current live status:** The user created an isolated staging Supabase project on October 8, 2026. Verified staging database connection, project-target identity, TLS, migrations 0001–0010 APPLIED with matching checksums, and the private `dental-attachments-staging` bucket creation/verification. HTTPS frontend/API hosting, Auth redirects, fictional owner/branch bootstrap and live smoke testing remain pending. Do not claim production or clinical readiness.
