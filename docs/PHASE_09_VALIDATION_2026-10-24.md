# Phase 09 - Functional, Security, and Hosted Validation (2026-10-24)

Project: dental-presentation
Branch: feature/single-clinic-cloud
Baseline Git commit: 46eb65c
Scope: isolated local test database, mocked unit-level storage, and non-destructive hosted HTTP checks. No hosted patient/financial writes, production credentials, or account changes.

## Executed and passed
- Auth and CORS unit tests, including signature/allowed-user rejection, expired token rejection, trusted-origin preflight, cross-origin rejection, private endpoint authorization.
- New defensive API header: Cache-Control: no-store for all /api endpoints except the public health endpoint, including authorization failures (local only, not yet deployed).
- Isolated local PostgreSQL integration: schema rollback test; patient -> appointment -> treatment with linked follow-up -> status completion -> payment -> reversal -> balances; follow-up rescheduling/history. All 3 integration tests passed.
- Isolated local demo lifecycle: Fill -> edit -> Reset -> Fill -> Reset, validating scoped cleanup of records and private-storage fixtures. The test checks that the dedicated local database is empty before starting; passed.
- Full default automated suite: 116 passed, 2 optional integration tests skipped in the default run; 0 failures.
- Frontend Vite build passed (large bundle warning).
- Hosted non-destructive API checks: /api/health HTTP 200; anonymous patients, exports, and demo clear HTTP 401; trusted origin OPTIONS HTTP 204; untrusted origin OPTIONS HTTP 500 without a permissive Access-Control-Allow-Origin. No authenticated hosted requests made.

## Outstanding: not fully verified
- End-to-end authenticated hosted UI for patient CRUD, appointments, treatments, payments, attachments, and exports (requires authorized browser session). Passing isolated tests does not prove hosted workflows.
- Private Supabase Storage upload/preview/download/delete using hosted credentials, and hosted bucket MIME allowlist compatibility (.doc/.docx currently differ from backend).
- Supabase email password-recovery flow (rate limit encountered by owner; intentionally deferred).
- Browser/device responsive regression for all views, including authenticated screen behaviors.
- Actual hosted backup and restore; cloud backup is intentionally disabled.
- Hosted Demo Fill/Reset remains disabled, requiring separate owner approval before any production-like mutation.
- Phase 11 dependency remediation: npm audit --omit=dev reported 13 production dependency advisories (2 critical, 5 high, 6 moderate), including jsPDF and proxy-addr, at this date. Do not silently force upgrade across a major API boundary. Review patches and validate print/export functionality before release. The audit command exited nonzero due to findings.
- Untrusted-origin preflight returns HTTP 500 instead of 403; CORS blocks the browser, but status/error handling could be clearer.
- New Cache-Control change remains only in local working tree until user commits, pushes, and deploys.

## Local changes
- server/src/cloudApp.js: no-store cache headers for protected API.
- server/src/cloudApp.test.js: no-store and CORS regression tests.
- This report.
No commit, push, migration, Render/Vercel redeploy, or production database mutation performed.

## Release recommendation
Pause promotion to real clinical use. The main next step is review and remediation of vulnerable dependencies, followed by authenticated hosted end-to-end validation with fictional records and a verified backup/recovery policy.
