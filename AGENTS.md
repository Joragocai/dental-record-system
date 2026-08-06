# Repository Guidelines

## Source of Truth

Read `README.md` completely before changing code, schema, routes, or deployment files. Treat it as the approved V2 specification. Use this file as the working guide for repository behavior; do not duplicate the full product spec here.

## Architecture Baseline

The active codebase is a Node.js workspace with `client/` and `server/`, but approved V2 work targets a cloud-ready architecture: React + Vite frontend, Express API, PostgreSQL, private object storage, managed authentication, append-only audit logging, and separate local, staging, and production environments. Preserve current clinic workflows while replacing local-only infrastructure incrementally. Do not recreate removed legacy `.bat` launchers.

## Roles, Permissions, and Security

Backend enforcement is mandatory. Every protected route must authenticate, authorize, validate input, and audit sensitive actions. The five approved roles are `Patient`, `Personnel`, `Dentist`, `Clinic Administrator`, and `System Administrator`; keep them separate in code even when one user has multiple roles. The current doctor uses one account with both `Dentist` and `Clinic Administrator`. The `System Administrator` is a technical role only and must not receive routine access to patient, clinical, attachment, or financial data. Never rely on hidden UI controls as security, never expose service-role secrets to the client, and never use public storage for patient files.

## Data and Repository Handling

Do not commit real patient data, SQLite database files, uploads, exports, backups, `.env` files, or secrets. Treat `data/`, `uploads/`, `exports/`, and `backups/` as migration or runtime artifacts, not deployable assets. Preserve verified business rules, especially annual patient/treatment code behavior, discount rules, appointment history, and backup integrity. Use PostgreSQL migrations for schema changes; never edit an old applied migration.

## Testing and Quality Gates

Every business-rule change requires tests. Preserve and expand regression coverage for patient/treatment code generation, future-date rejection, Senior/PWD discount logic, balances, appointment status/history, dashboard schedule filtering, attachment restrictions, exports, and backups. The V2 target toolchain is `lint`, `typecheck`, unit tests, integration tests, end-to-end tests, build checks, and migration verification. Before completing work, run the relevant checks you can support and report failures honestly.

## Branch and Change Workflow

Base V2 feature work on `refactor/v2-cloud-migration`. Use focused feature branches such as `feature/authentication` or `feature/private-storage`; keep changes commit-sized and avoid unrelated rewrites. Preferred commit style is concise and imperative, ideally Conventional Commit form such as `feat: add PostgreSQL patient repository` or `fix: prevent duplicate appointment slots`. Update documentation whenever architecture, schema, endpoints, environment variables, permissions, or workflows change.

## Subagent Policy

Use subagents first for independent read-heavy work. Wait for all requested subagents before the parent produces conclusions. Keep subagents read-only unless the user explicitly authorizes a write task, and never allow multiple agents to edit overlapping files. The parent agent remains responsible for the final plan, changes, validation, and report. Never expose secrets or real patient data. Do not run destructive Git, database, storage, backup, or deployment commands. Return concise findings with file references instead of raw command output.
