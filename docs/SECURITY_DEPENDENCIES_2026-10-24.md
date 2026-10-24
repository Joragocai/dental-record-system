# Dependency Security Remediation — Verified 2026-10-24

Project: dental-presentation; branch: feature/single-clinic-cloud. No Git commit, push, or hosted deployment has been made for these changes.

## Verified installed dependency versions
- axios 1.20.0, jsPDF 4.2.1, react-router-dom/react-router 7.18.4, express 4.22.3.
- follow-redirects 1.16.1, brace-expansion 1.1.21 and 2.1.7 for affected production paths, ExcelJS 4.4.0 using uuid 11.1.1 via override.
- The root, client and server package manifests and package-lock.json were updated together.

## Audit results
- `npm audit --omit=dev`: **0 reported vulnerabilities** (all severity levels).
- `npm audit` (including development tools): **13 reported findings: 1 critical, 7 high, 5 moderate**. These are linked to development/build tooling (Vite, Tailwind, PostCSS, concurrently and their dependencies). Do not claim the *whole* tree is vulnerability-free. Updating these tools, where necessary across majors, is a separate tested change.

## Regression checks
- Full default tests: 116 passed, 2 optional integration tests skipped, 0 failed.
- Disposable local PostgreSQL integration (schema, patient/appointments/treatment/payment/balances, follow-up): 3 passed.
- Disposable local demo data Fill -> Edit -> Reset -> Fill cycle: 1 passed.
- Vite production build: passed, with an existing large bundle warning.
- ExcelJS write/read in-memory fictional workbook: passed.
- React Router 7 memory-router/link server-render API smoke: passed (non-actionable useLayoutEffect warnings in server-render-only check).
- jsPDF 4 PDF image-output regression: **not verified**. One miniature PNG fixture was rejected by its PNG decoder, and a follow-up scripted smoke test was blocked by the execution tool. The browser print/PDF flow still needs direct testing.
- Authenticated hosted browser flows (including attachments/exports) remain pending. Deployment credentials were not used or exposed.

## Release cautions
1. Production-only audit is clean, but this does not certify clinical production readiness.
2. Before publishing, test browser PDF downloads after the jsPDF major upgrade and critical navigation cases after the React Router v7 upgrade: login, password recovery, patient/treatment edit, blocked unsaved navigation.
3. All development-tool advisories should be reviewed and mitigated in a separate dependency update before accepting the repo as fully clean.
4. Existing `Cache-Control: no-store` improvements and Phase 09 tests remain local changes.
5. Neither `npm audit fix --force` nor any destructive hosted action was run.
