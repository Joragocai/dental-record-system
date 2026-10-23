# Single-clinic cloud migration (demo-preserving)

Development branch: `feature/single-clinic-cloud`.

## Non-negotiable invariants
- Keep `demo/presentation` intact as the SQLite rollback/reference implementation.
- Only fictional records may be populated in hosted demo mode.
- Demo Fill and Reset stay available **only** to the authenticated authorized operator in isolated demo infrastructure.
- Reset must delete demo database records and demo Storage objects together; never target a production project.
- Run migrations using a separate, controlled process before serving requests.
- No public sign-up. Supabase Auth single authorized account; validate JWT server-side and check fixed allowlisted user ID.
- Back-end API and Socket.IO access, file downloads, exports, and demo controls are protected.
- Preserve patient/treatment public IDs and append-only financial ledger semantics.
- Do not run SQLite vacuum/snapshot or local-file backup workflows against PostgreSQL.

## Phases and verification gates

0. Git baseline: GitHub main, presentation, and cloud branch checked; preserve stable tag and older V2 branch.
1A. Inventory (completed): SQLite is currently imported from `server/src/db/database.js`, financial tests, and backup subsystem. Services have synchronous `.prepare().get()/.all()/.run()` calls. Demo data currently seeds patients, treatments, appointments and attachments in one SQLite transaction; reset includes SQLite-only checks. Treat all of these as migration work.
1B. Schema (live validated against isolated `dental_presentation_test`): three versioned migrations define patients, treatments, appointments, attachments, and treatment_payments with checks and indexes. The migration runner holds an advisory transaction lock, verifies SHA-256 file checksums, prevents out-of-order migrations and rolls back failures. Run against an isolated disposable PostgreSQL database before use. DATE values require YYYY-MM-DD normalization, TIMESTAMPTZ values ISO normalization, and monetary NUMERIC(14,2) values must be converted carefully to numbers/centavos at the service boundary. Do not assume pg returns JavaScript numbers for NUMERIC/BIGINT.
1C. Services (in progress): PostgreSQL patient read/search, create/update adapters and appointment read/create/update/status adapters now exist with unit tests. `server/src/services/patientFields.js` is a shared field list used by existing SQLite service and new PostgreSQL writes. Treatment CRUD, attachment metadata and balances adapters now have unit tests. Migration `0004_public_id_counters.sql` has been applied to the isolated PostgreSQL test database and provides an atomic, per-year counter; `previewPublicId` is read-only while `allocatePublicId` must be called inside the same transaction as the insert. This means the final assigned ID might differ from a previously displayed preview; the API and UI must handle this atomically. PostgreSQL dashboard/scheduling adapters and a standalone clinical API router now cover patients, appointments, treatments, balances, payments, and reversals. A live end-to-end HTTP test using fictional data in `dental_presentation_test` verifies patient → appointment → treatment → payment → reversal → balances and deletes its test fixtures afterward. The router is deliberately NOT mounted in the active app until authentication, exports, attachment binary storage, backup, and hosted Demo Fill/Reset are converted. Remaining: authenticated API integration, exports, private attachment storage, database backup strategy, hosted demo controls, and hosted verification. The active SQLite routes are intentionally unchanged. Do NOT activate PostgreSQL backend until every dependent service is ready. Move query-by-query to async `pg` calls, parameterized SQL, transaction-scoped connections; migrate ID generation without races.
1D. Finance: row-lock treatment when applying payment/reversal; enforce request-id uniqueness and cents arithmetic.
1E. Demo: PostgreSQL-aware idempotent fictional-data seeding, authorized isolated Reset, and private demo file storage.
2. Login: Supabase Auth email/password, protected React routes, Render-side verified session and approved user ID, authenticated realtime.
3. Storage/backup: private Supabase Storage bucket, upload/download/delete metadata, external backup strategy and restore rehearsal.
4. Deploy: Vercel frontend, Render backend using `PORT`/`0.0.0.0`, Supabase DB/Auth/Storage, configured origins and Socket.IO URL.
5. QA: integration suite for registration, treatment, appointment, financial ledger, auth denial, Demo Fill → edits → Reset → Fill, storage, and restart.
6. Client review: separate fictional demonstration environment and tested workflows.

## Current implemented groundwork
`server/src/db/postgres/pool.js` validates the DB URL and TLS configuration and exposes an asynchronous connection pool plus safe transaction helper. `server/src/db/postgres/migrations/` and `migrate.js` define the core schema and migration runner. Tests mock the runner and verify ordering, rollback and checksum protection; they do NOT replace a real PostgreSQL integration test. PostgreSQL 18 is installed locally, `pg` is installed and locked, and migrations applied successfully to `dental_presentation_test` using `node --env-file=server/.env server/src/db/postgres/migrate.js`; a second run skipped all three. `PG_INTEGRATION_TEST=1 node --env-file=server/.env --test server/src/db/postgres/integration.test.js` passed its rollback-only schema smoke test. PostgreSQL payment, patient read, date and centavos helpers are implemented separately but are not yet wired into the Express API. Do not claim a complete live payment workflow validation or deployed cloud app. Before switching backends, finish all async service, backup and demo control conversions and run disposable end-to-end integration tests. Do not run migrations against Supabase or an existing shared database before testing against a disposable target. The existing SQLite runtime is deliberately not switched.

## Supabase demo database verification (2026-10-23)

Dedicated Supabase project `dental-presentation-demo`, Singapore `ap-southeast-1`, connects through the IPv4 session pooler using TLS certificate verification. The CA certificate is downloaded locally at `server/certs/prod-ca-2021.crt` and excluded from Git. Local `server/.env.local` points to this project and remains private; `server/.env` continues to point at the local PostgreSQL test database. Verified command:

`NODE_EXTRA_CA_CERTS=server/certs/prod-ca-2021.crt node --env-file=server/.env.local server/src/db/postgres/migrate.js`

The public schema was initially empty. Applied migrations `0001`–`0004` successfully and verified a second run skipped all four. Inspected 7 tables including `schema_migrations` and `public_id_counters`; application record counts remained zero. Do not run local destructive integration tests against this cloud database. **Cloud authentication, private attachment storage, access control, and hosted demo controls are NOT yet integrated; do not expose the unauthenticated standalone PostgreSQL router.** Render must have equivalent trusted CA configuration before production use.

## Authentication and private Storage foundation (implemented, not yet active)

`server/src/auth/supabaseAuth.js` validates asymmetric RS256/ES256 JWT signatures using the project's HTTPS JWKS endpoint; checks issuer, authenticated audience/role, expiry, and exactly one allowed Supabase Auth user ID. It fails closed on missing/invalid tokens. It does not support legacy HS256 tokens: use an asymmetric signing key in Supabase JWT Keys before enabling cloud mode. This middleware is **not yet installed on the active Express router**; do not publicly deploy until that integration is complete and every endpoint is protected.

`server/src/storage/privateAttachments.js` defines a private bucket adapter for `dental-demo-attachments` with validated object paths, allowed MIME types and size limit. Requests require backend-only `SUPABASE_SECRET_KEY` (never expose to frontend), and live Supabase uploads are not yet verified. Do not reuse local uploads or static /uploads serving for private cloud files.

Required cloud settings (secrets remain outside Git):
- `SUPABASE_URL`: HTTPS project URL.
- `SUPABASE_ALLOWED_USER_ID`: UUID from Authentication → Users (not the email and not a password).
- `SUPABASE_SECRET_KEY`: backend-only Storage service credential; do not put it in Vite/Vercel variables.
- `DATABASE_URL`: existing cloud PostgreSQL session pooler URL.
- `PG_SSL_MODE=require` plus the trusted CA certificate configuration already verified.

Phase 02 implementation update: `server/src/cloudApp.js` now creates a PostgreSQL-only Express app requiring a valid authorized Supabase JWT before any clinical API route. It deliberately never mounts SQLite routes, legacy backup, public uploads, exports, or Demo Fill/Reset; unknown cloud routes return 404 after authentication. `server/src/cloudIndex.js` is the separate startup entry point available through `npm run start:cloud --workspace server`, using PORT and CLOUD_ALLOWED_ORIGINS. Tests confirm 401 denial for anonymous and invalid JWTs, and 404 for unavailable legacy paths when authorized. Not yet deployed. Remaining: React sign-in SDK and session handling, private file routes, cloud-compatible exports/backups/Demo Fill/Reset, Socket.IO authentication or controlled disablement, complete hosted QA. Set CLOUD_ALLOWED_ORIGINS to the exact frontend HTTPS origin before running cloud mode.

## Remaining external setup
A Supabase PostgreSQL/Auth/Storage project, one securely provisioned account, Render service, Vercel project and secrets must be provided through their hosting dashboards (not committed to Git). A live migration or deployment is not considered complete until cloud integration tests run on those services.

## Recommended environment (documentation only)
`DATABASE_URL` — PostgreSQL connection string, secret.
`PG_SSL_MODE=require` — Production TLS (certificate-validated).
`NODE_ENV=production` — Production environment.
Do **not** set `DENTAL_APP_MODE=demo` on an environment holding real patient data.
