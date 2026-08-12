# Repository Guidelines

## Source of Truth

Read `README.md` completely before changing code, schema, routes, or deployment files. Treat it as the approved V2 specification. Use this file as the working guide for repository behavior; do not duplicate the full product spec here.

## Documentation Authority

Use project documentation in this order when instructions conflict:

1. `README.md` — approved product requirements and architecture
2. This `AGENTS.md` — repository and Codex working rules
3. Approved documents under `docs/decisions/`
4. Verified architecture documentation under `docs/architecture/`
5. Testing specifications under `docs/testing/`
6. Current task specifications under `docs/codex-prompts/`
7. Planning documents under `docs/plans/`

Documents marked `draft`, `proposed`, `brainstorm`, or similar are not approved implementation requirements.

External Obsidian notes are reference or planning material only unless their approved decisions are formally added to the repository.

## Architecture Baseline

The active codebase is a Node.js workspace with `client/` and `server/`, but approved V2 work targets a cloud-ready architecture: React + Vite frontend, Express API, PostgreSQL, private object storage, managed authentication, append-only audit logging, and separate local, staging, and production environments. Preserve current clinic workflows while replacing local-only infrastructure incrementally. Do not recreate removed legacy `.bat` launchers.

## TypeScript Migration Policy

The approved V2 codebase will migrate incrementally from JavaScript/JSX to TypeScript/TSX before major new V2 modules are built.

Do not perform a whole-application TypeScript rewrite in one task. Preserve regression-tested behavior during conversion and allow JavaScript and TypeScript to coexist temporarily when required.

New V2 application source should use TypeScript by default:
- `.ts` for backend, utilities, services, repositories, schemas, scripts, and shared non-React code
- `.tsx` for React components and pages containing JSX

Do not use `any`, `@ts-ignore`, unsafe type assertions, or disabled compiler checks as broad substitutes for resolving type errors.

TypeScript compile-time types do not replace runtime validation. Continue validating HTTP input, environment variables, database results where needed, storage metadata, and other trust boundaries.

For TypeScript migration work, run the relevant regression tests, `npm run typecheck`, and the applicable production build before declaring the task complete.## TypeScript Migration Policy

The approved V2 codebase will migrate incrementally from JavaScript/JSX to TypeScript/TSX before major new V2 modules are built.

Do not perform a whole-application TypeScript rewrite in one task. Preserve regression-tested behavior during conversion and allow JavaScript and TypeScript to coexist temporarily when required.

New V2 application source should use TypeScript by default:
- `.ts` for backend, utilities, services, repositories, schemas, scripts, and shared non-React code
- `.tsx` for React components and pages containing JSX

Do not use `any`, `@ts-ignore`, unsafe type assertions, or disabled compiler checks as broad substitutes for resolving type errors.

TypeScript compile-time types do not replace runtime validation. Continue validating HTTP input, environment variables, database results where needed, storage metadata, and other trust boundaries.

For TypeScript migration work, run the relevant regression tests, `npm run typecheck`, and the applicable production build before declaring the task complete.

## Roles, Permissions, and Security

Backend enforcement is mandatory. Every protected route must authenticate, authorize, validate input, and audit sensitive actions. The five approved roles are `Patient`, `Personnel`, `Dentist`, `Clinic Administrator`, and `System Administrator`; keep them separate in code even when one user has multiple roles. The current doctor uses one account with both `Dentist` and `Clinic Administrator`. The `System Administrator` is a technical role only and must not receive routine access to patient, clinical, attachment, or financial data. Never rely on hidden UI controls as security, never expose service-role secrets to the client, and never use public storage for patient files.

## Data and Repository Handling

Do not commit real patient data, SQLite database files, uploads, exports, backups, `.env` files, or secrets. Treat `data/`, `uploads/`, `exports/`, and `backups/` as migration or runtime artifacts, not deployable assets. Preserve verified business rules, especially annual patient/treatment code behavior, discount rules, appointment history, and backup integrity. Use PostgreSQL migrations for schema changes; never edit an old applied migration.

## Testing and Quality Gates

Every business-rule change requires tests. Preserve and expand regression coverage for patient/treatment code generation, future-date rejection, Senior/PWD discount logic, balances, appointment status/history, dashboard schedule filtering, attachment restrictions, exports, and backups. The V2 target toolchain is `lint`, `typecheck`, unit tests, integration tests, end-to-end tests, build checks, and migration verification. Before completing work, run the relevant checks you can support and report failures honestly.

## Codex Task Specifications

For substantial implementation work, use task specifications stored under:

`docs/codex-prompts/`

A task specification defines the current goal, scope, constraints, validation requirements, and completion criteria.

When a task specification is provided:

1. Read `README.md`.
2. Read this `AGENTS.md`.
3. Read the referenced task specification completely.
4. Inspect the relevant existing implementation before editing.
5. Use applicable read-only subagents for repository exploration, requirements review, security review, or test review.
6. Produce a short implementation plan before writing.
7. Implement only the approved task scope.
8. Run the required validation.
9. Stop after the completion report unless the user explicitly authorizes the next task.

Do not automatically continue into the next roadmap phase because a previous task completed successfully.

Task specifications are subordinate to `README.md` and this `AGENTS.md`. If a task specification conflicts with an approved requirement, stop and report the conflict instead of silently choosing one.

## Branch and Change Workflow

Base V2 feature work on `refactor/v2-cloud-migration`. Use focused feature branches such as `feature/authentication` or `feature/private-storage`; keep changes commit-sized and avoid unrelated rewrites. Preferred commit style is concise and imperative, ideally Conventional Commit form such as `feat: add PostgreSQL patient repository` or `fix: prevent duplicate appointment slots`. Update documentation whenever architecture, schema, endpoints, environment variables, permissions, or workflows change.

For the current development workflow, Codex should not commit, push, merge, rebase, reset, or otherwise finalize Git history unless the user explicitly requests that action.

After implementation and validation, Codex should leave the working tree available for review and report the files changed and checks performed.

The preferred workflow is:

Task specification
-> repository inspection
-> subagent review
-> implementation
-> automated validation
-> Codex review
-> human diff review
-> human-approved commit

## Subagent Policy

Use subagents first for independent read-heavy work. Wait for all requested subagents before the parent produces conclusions. Keep subagents read-only unless the user explicitly authorizes a write task, and never allow multiple agents to edit overlapping files. The parent agent remains responsible for the final plan, changes, validation, and report. Never expose secrets or real patient data. Do not run destructive Git, database, storage, backup, or deployment commands. Return concise findings with file references instead of raw command output.

