# Temporary staging-only dashboard role testing

**Scope:** Frontend-only demonstration of each role's real dashboard **presentational view**. This does not substitute for role authentication, authorization, hosted multi-user security testing, or transactional end-to-end QA. Remove or re-review before production release.

## Access

- Build must use the existing approved `VITE_APP_ENV=staging` config, never `production`.
- User signs in normally using the active fictional Owner-Dentist identity (both `DENTIST` and `CLINIC_ADMINISTRATOR`), then opens `/dashboard`.
- The switcher renders only after an authorized response from `GET /api/dashboard/context` proves the *exact* dual-role pair; an unauthenticated or unauthorized user never sees the selector.
- The selector includes Patient, Personnel, Dentist, Clinic Administrator, System Administrator, and Owner-Dentist.

## What is real vs simulated

- Personnel, Dentist, Patient, Clinic Administrator, and System Administrator previews reuse their live **presentation components**. Live pages still perform normal backend checks and fetches; the preview injects **fictional, in-memory** props instead.
- Owner-Dentist preview combines the independently authorized Dentist and Clinic Administrator presentation components using fictional props.
- Scenario/date/branch selections and simulated contact, appointment and expense actions are frontend-only and do not call backend endpoints or persist data. Navigation clicks inside the preview are prevented, while **actual authorized** links elsewhere on the dashboard work normally.
- The preview has an unmistakable **STAGING SIMULATION — NOT A LIVE ROLE SESSION** banner. It neither adds nor impersonates real clinic permissions, and it cannot be used to certify role-specific backend authorization or persistence.

## Validation and deployment controls

- Run `npm run typecheck`, `npm run build`, `npm run test:staging`, six-role presentation tests, existing dashboard view tests, and authorization tests.
- The regular UI at `/dashboard` uses the protected backend context; the temporary feature does **not** add Express routes, migrations, test passwords, production IAM accounts or privileged permissions.
- Do not include unrelated, uncommitted local-V2 preview changes in the staging release; stage the specific dashboard feature files only.
- Vercel automatically builds when approved code is pushed to `refactor/v2-cloud-migration`. A frontend-only preview change **does not require** a Render redeploy; redeploy Render only when backend code changed or its existing deployed SHA is behind the approved release.
- Genuine role-function testing requires separately approved, activated fictional identities. Do not disable backend RBAC or bypass patient ownership to make the preview interactive.
