# Khurana Calilap Dental Record System

A single-clinic dental record management application for patient registration, treatment records, appointments and follow-ups, balances and payments, private attachments, and clinic reporting.

**Repository:** `dental-presentation`

**Active cloud-development branch:** `feature/single-clinic-cloud`

**Purpose:** A functional, fictional-data demonstration for interviews and system evaluation. It is not approved for real patient data or clinical production use.

> This repository also preserves the original SQLite application. The legacy and cloud workflows are separate. Do not use old SQLite backup or demo-reset procedures against PostgreSQL or Supabase.

## Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | React, Vite, Tailwind CSS | Responsive clinic workspace and forms |
| Backend | Node.js, Express | Clinical APIs, authorization, file handling, exports |
| Cloud database | PostgreSQL (Supabase) | Patients, treatments, appointments, financial ledger |
| Authentication | Supabase Auth | Single authorized clinic administrator sign-in |
| Private files | Supabase Storage | Hosted attachments with authenticated server-side access |
| Hosting | Vercel (client), Render (API) | Separately deployed cloud demo services |
| Legacy local database | SQLite (`node:sqlite`) | Original local-only implementation and rollback reference |
| Documents | ExcelJS, html2canvas, jsPDF | Excel reports and print/PDF output |

The cloud branch is designed for one clinic and one authorized account. It is distinct from the separate multi-branch dental V2 project.

## Key features

- **Clinic Home:** Clinic Snapshot, quick actions, today's appointments/follow-ups, recent patients, birthdays, and a schedule-by-date table.
- **Patients:** Register, search, edit, and review patient profiles, medical alerts, treatment history, and attachments.
- **Treatments:** Record procedures, dentists, tooth numbers, treatment dates, fees, discounts, and follow-up plans.
- **Appointments:** Create and edit appointments, manage statuses, and link treatment follow-ups to their own appointment records.
- **Payments and Balances:** View unpaid, partially paid, and settled treatments; record payments in a ledger, inspect financial history, and review balances.
- **Attachments:** Upload, preview, download, and delete permitted clinical files. Cloud attachment access is protected by the backend.
- **Exports:** Print/PDF clinical documents and export supported data to Excel.
- **Demo controls:** Authorized **Demo Fill** and **Demo Reset** for disposable fictional data in a specifically isolated environment. Fill replaces active demo data; Reset deletes active demo data. Never use these controls for real records.
- **Account UI:** Protected sign-in, profile menu, and responsive desktop/mobile navigation.

The exact set of hosted features depends on the deployed code revision and environment configuration. Local build or test success does not prove hosted end-to-end behavior.

## Repository layout

```text
dental-presentation/
  client/                     React/Vite frontend
    public/                   Public frontend assets
    src/                      Pages, components, state, API helpers
    vercel.json               SPA routing configuration
  server/                     Express backend
    src/                      Legacy and PostgreSQL/cloud modules
      db/postgres/migrations/ Versioned PostgreSQL migrations
    scripts/                  Local startup, demo, and backup scripts
  docs/                       Setup, migration, deployment, and QA guides
  data/                       Ignored local runtime data
  demo-uploads/               Ignored local fictional demo files
  demo-exports/               Ignored local demo exports
  demo-backups/               Ignored local demo backups
  render.yaml                 Cloud API hosting blueprint
  package.json                npm workspace scripts
  README.md
```

Do not commit runtime files, `.env` files, secrets, downloaded certificates, local databases, clinical attachments, or encrypted backup archives.

## Prerequisites

- Node.js and npm (use a supported Node version; the Render blueprint uses Node 22).
- Dependencies installed from the repository root with `npm ci`.
- For the **local PostgreSQL preview**, a configured local PostgreSQL database and the previously provisioned Supabase Auth account. Refer to `docs/LOCAL_POSTGRES_PREVIEW.md` for the required isolated databases and environment files.
- For **cloud hosting**, independently configured Vercel, Render, and Supabase projects. Never place backend credentials in Vite variables.

Run commands from the project root:

```bash
cd ~/projects/dental-presentation
npm ci
```

## Recommended local run: PostgreSQL preview

This previews the cloud-oriented application locally, with clinical records stored in a separate local PostgreSQL database and login through Supabase Auth.

```bash
npm run dev:postgres
```

Open: **http://127.0.0.1:5174**

API: **http://127.0.0.1:3003/api**

The launcher expects:

- `server/.env` with the **disposable local test** PostgreSQL credentials. The launcher explicitly changes its database target to the separate `dental_presentation_local` database.
- `server/.env.local` with the configured Supabase Auth URL and allowlisted user ID.
- `client/.env.local` with the browser-safe Supabase settings.

The launcher checks the local source database URL before starting. The demo data must remain entirely fictional. **Do not point local preview or destructive integration tests at hosted Supabase data.** Stop the running processes with `Ctrl+C`.

## Legacy local SQLite modes

These commands remain in the repository for the original local application; they are **not** the PostgreSQL/cloud demo:

| Command | Purpose | Frontend |
| --- | --- | --- |
| `npm run dev` | Original SQLite clean mode | http://localhost:5173 |
| `npm run dev:demo` | Original isolated fictional SQLite demo | http://localhost:5173 |
| `npm run demo:prepare` | Prepare the legacy SQLite demo dataset | N/A |
| `npm run demo:reset` | Recreate the original fictional SQLite demo data | N/A |
| `npm run demo:cleanup` | Remove generated legacy demo data | N/A |
| `npm run backup:create` | Manual **SQLite/local-files** backup only | N/A |

The legacy backend ordinarily uses port **3002**. Do not run two frontends on the same port. Local SQLite data, local PostgreSQL data, and hosted Supabase data are separate.

The older Windows `.bat` launchers and `startDemo.txt` are not needed for these npm commands. The original SQLite reference implementation remains available in `demo/presentation`; do not remove its underlying source or runtime scripts as part of launcher cleanup.

## Cloud deployment overview

The cloud branch has deployment configuration for:

- **Vercel frontend:** root `client`, build `npm run build`, output `dist`, with SPA rewrites in `client/vercel.json`.
- **Render backend:** separate `dental-presentation-demo-api` service, build `npm ci`, start `npm run start:cloud --workspace server`, and health check `/api/health`. The repository's `render.yaml` disables automatic deployment.
- **Supabase:** dedicated PostgreSQL/Auth/private Storage project for the presentation demo.

Backend configuration names include `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_ALLOWED_USER_ID`, `CLOUD_ALLOWED_ORIGINS`, and secure PostgreSQL TLS settings. Frontend configuration uses browser-safe `VITE_*` values such as `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY`.

**Do not copy actual values into the README or Git.** Set secrets in the appropriate private local environment or hosting service. PostgreSQL schema migrations are run through an explicit, separately verified process; the API startup does not automatically migrate a hosted database. Never enable automatic deployment, schema changes, Demo Fill, or Reset without confirming the intended isolated project and safety controls.

For the current procedures and restrictions, see `docs/CLOUD_DEPLOYMENT_READINESS.md`, `docs/SINGLE_CLINIC_CLOUD_MIGRATION.md`, and `docs/HOSTED_DEMO_RESET_SAFETY_GATE_2026-10-24.md`.

## Backups and demo safety

- The legacy `npm run backup:create` backs up the local SQLite application. **It is not a Supabase/PostgreSQL backup.**
- The cloud backup feature uses a separate controlled workflow for downloadable encrypted `.drb` archives when explicitly enabled and properly configured; do not assume a hosted backup is active or verified.
- A complete PostgreSQL recovery needs both application database records **and actual private attachment bytes**. A database-only export is not a complete backup.
- There is **no generally available hosted Restore Backup button** documented for this project. Recovery requires a separately approved and tested procedure.
- Demo Fill and Demo Reset are destructive to the **active fictional demo dataset**. Independent backup files previously saved outside that dataset are not the same as active records.
- Use only fictional patients and payments during demonstrations. Never use real clinical, personal, or financial data in the disposable demo.

See `docs/HOSTED_DEMO_BACKUP_ACTIVATION_2026-10-24.md` and `docs/HOSTED_DEMO_BACKUP_RECOVERY_PLAN_2026-10-24.md` for restrictions and recovery planning.

## Build and test

```bash
npm run build
node --test
```

The first command builds the frontend. The second runs Node's discovered tests; PostgreSQL integration tests requiring opt-in flags may be skipped by default.

**Database integration tests are destructive by design.** Only run those commands against the explicitly designated, disposable local test database after verifying its identity and contents. Do not reuse credentials for a shared or hosted Supabase project. Use the exact guarded commands documented in `docs/CLOUD_DEPLOYMENT_READINESS.md`.

Before a live demo, manually check sign-in, patient search, fictional patient registration, treatments, appointments, payments, attachments, Excel export, print/PDF, responsive navigation, and logout. A successful build is not a substitute for browser and hosted-environment testing.

## Project documentation

- `docs/LOCAL_POSTGRES_PREVIEW.md` — isolated PostgreSQL preview and port setup.
- `docs/CLOUD_DEPLOYMENT_READINESS.md` — cloud configuration, release gates, and safety checks.
- `docs/PHASE_04_HOSTED_UI_INTERVIEW_READINESS_2026-10-24.md` — interview walkthrough and visual QA checklist.
- `docs/PHASE_09_VALIDATION_2026-10-24.md` — last recorded scoped test results and outstanding validation items.
- `docs/HOSTED_DEMO_RESET_SAFETY_GATE_2026-10-24.md` — destructive demo-control guardrails.
- `docs/HOSTED_DEMO_BACKUP_ACTIVATION_2026-10-24.md` — encrypted backup feature activation guidance.

## Repository and release policy

The `feature/single-clinic-cloud` branch contains the cloud demo work. `main` and `demo/presentation` preserve older local-application history. Do not merge, force-push, or deploy to real clinical use without an explicit release review. Review `git status`, run tests, and verify deployment settings before pushing changes that could trigger a hosted build.
