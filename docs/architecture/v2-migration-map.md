# V2 Migration Map

## Purpose

This document classifies current implementation areas for the V2 selective
replacement strategy. The goal is to clarify what should be reused, adapted,
bridged, replaced, or retired later while PostgreSQL and other V2 foundations
are introduced incrementally.

Remaining JavaScript is not a failure condition by itself. New V2 source should
still default to TypeScript, but legacy code should be judged by architectural
fit and verified parity needs rather than by a zero-JavaScript target.

## Classification Rules

- `KEEP`: already aligned enough to continue using with little or no structural
  change.
- `ADAPT`: reusable, but expected to need focused changes to fit V2.
- `REPLACE`: likely better rebuilt for V2 than incrementally converted in place.
- `BRIDGE`: temporary compatibility layer that should remain until consumers are
  moved.
- `RETIRE-LATER`: active legacy path that may stay in service until a verified
  replacement slice is live.

## Legacy Retirement Gates

Legacy code should not be removed until all of the following are true:

1. A target V2 path exists for the behavior being retired.
2. Approved requirements for that behavior are implemented.
3. Behavior and parity tests pass for the replacement path.
4. Relevant data migration is verified where persistence changes are involved.
5. The new runtime path is active for the intended workflow.
6. No live consumers still require the legacy implementation.
7. `npm run typecheck`, `node --test`, and relevant build checks pass after the
   removal.
8. The removal is completed in a focused, reviewed task.

Cross-cutting warning: the current suite does not yet provide auth, role,
branch, or patient-isolation coverage. Secure workflow retirement therefore
requires more than the present unit and service-level parity tests.

## Shared Client TypeScript Foundation

| Area | Classification | Notes |
| --- | --- | --- |
| `client/src/lib/backupUi.ts` | ADAPT | Reusable typed helper foundation, but future storage and auth changes may alter integration points. |
| `client/src/lib/printDocument.ts` | ADAPT | Good typed base, but likely affected by future document/export workflow changes. |
| `client/src/lib/attachments.ts` | ADAPT | Typed helper is reusable, but V2 storage and access rules will change surrounding behavior. |
| `client/src/lib/formatters.ts` | KEEP | Stable formatting logic with low architectural coupling. |
| `client/src/lib/validation.ts` | ADAPT | Reusable rules, but future V2 forms and API contracts may refine boundaries. |
| `client/src/lib/forms.ts` | ADAPT | Reusable foundation, but likely to change with future feature-slice forms. |

## Shared Client Bridges

| Area | Classification | Notes |
| --- | --- | --- |
| `client/src/lib/attachments.js` | BRIDGE | Keep until all callers use the TypeScript module directly. |
| `client/src/lib/formatters.js` | BRIDGE | Keep until all callers use the TypeScript module directly. |

## Appointment Batch 5

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/postgres/migrations/0004_appointment_core.sql` | KEEP | Batch C Appointment foundation migration; extend only through later ordered migrations. |
| `server/src/postgres/batchC/*.ts` | KEEP | Dedicated PostgreSQL Appointment foundation and fictional parity helpers; no runtime cutover yet. |
| `server/src/services/appointmentService.ts` | ADAPT | Useful typed domain and service base for future replacement slices. |
| `server/src/services/appointmentService.js` | BRIDGE | Preserve while JavaScript route consumers still import it. |
| `server/src/routes/appointments.js` | RETIRE-LATER | Active V1 route path; replacement depends on broader V2 API and auth work. |
| Appointment JSX UI files | RETIRE-LATER | Current UI can remain until the V2 appointment slice is implemented. |
| Appointment API calls in `client/src/lib/api.js` | RETIRE-LATER | Likely to change during V2 API and auth transition. |
| Appointment logic in `server/src/db/database.js` | RETIRE-LATER | Persistence path is tied to SQLite and should not be converted further just for parity. |

## Authentication Foundation

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/auth/authConfig.ts` | KEEP | Phase 08A lazy server-only Supabase Auth configuration; importing auth modules does not require auth environment values until authentication is invoked. |
| `server/src/auth/bearerToken.ts` | KEEP | Strict bearer-credential parser that distinguishes missing/malformed credentials without exposing token content. |
| `server/src/auth/authVerifier.ts` | KEEP | Provider boundary plus Supabase authenticated-user verifier using built-in `fetch`; maps only minimal verified identity and does not treat provider JWT `role` as clinic RBAC. |
| `server/src/auth/authService.ts` and `authErrors.ts` | KEEP | Internal authentication boundary and safe typed errors used by the Phase 08B Express middleware. |
| `server/src/auth/authMiddleware.ts` | KEEP | Phase 08B typed Express-facing authentication adapter; stores the verified principal in `res.locals.auth`, forwards safe failures, and sets the Bearer challenge for 401 responses. |
| `server/src/auth/*.js` compatibility bridges | BRIDGE | Thin JS-to-TS re-exports preserve the current Node 24 JavaScript runtime while auth internals remain TypeScript. Retire only when the server runtime/import strategy no longer needs them. |
| `server/src/routes/auth.js` | KEEP | Phase 08B protected auth router. Currently exposes only `GET /api/auth/session`; uses dependency injection for focused tests and does not perform authorization/RBAC. |
| `client/src/auth/*` | KEEP | Phase 08C provider-independent browser auth contracts, lazy public Supabase configuration, managed Supabase session adapter, and bearer-authenticated V2 API helper. Uses session-scoped persistence and does not expose service-role credentials. |
| `client/src/context/AuthContext.tsx` | KEEP | Phase 08C React auth/session orchestration. Restored or newly signed-in provider sessions are verified through the backend `/api/auth/session` boundary before the UI treats the identity as authenticated. |
| `client/src/pages/{LoginPage,ForgotPasswordPage,ResetPasswordPage,AuthAccountPage}.tsx` and `ProtectedAuthRoute.tsx` | KEEP | Phase 08C authentication-only UI. No public signup exists and only `/auth/account` is protected; existing V1 clinic pages remain outside this auth gate until their APIs are replaced/protected. |
| `docs/architecture/authentication-foundation.md` | KEEP | Records Phase 08A–08C server/client security properties, protected session boundaries, account-workflow decisions, and remaining authorization/provisioning gates. |
| `server/src/postgres/migrations/0005_application_user_access_foundation.sql` | KEEP | Phase 08D application-user/access schema: nullable Supabase auth linkage, lifecycle status, exactly five seeded application roles, many-to-many user-role assignments, and many-to-many branch assignments. |
| `server/src/repositories/applicationUserRepository.ts` | KEEP | Phase 08D parameterized PostgreSQL application-user repository with runtime row validation for user identity, roles, and branch memberships. |
| `server/src/services/applicationUserService.ts`, `applicationUserIdentity.ts`, and `applicationUserErrors.ts` | KEEP | Phase 08D internal application-user context boundary. Resolves verified auth UUIDs to active clinic identity plus deterministic role/branch membership while keeping safe status and persistence errors. It does not enforce permissions yet. |
| `docs/architecture/application-user-access-foundation.md` | KEEP | Records the Phase 08D identity/status/role/branch model and the separation between provider authentication and future application authorization. |
| `server/src/postgres/migrations/0006_authorization_rbac_foundation.sql` | KEEP | Phase 08E normalized permission and role-permission foundation with explicit GLOBAL/BRANCH/OWN scope metadata and conservative seeded grants. |
| `server/src/repositories/authorizationRepository.ts` | KEEP | Phase 08E parameterized permission-union repository. Resolves effective grants only from trusted application role codes and validates permission rows at the PostgreSQL boundary. |
| `server/src/services/authorizationService.ts` and `authorizationErrors.ts` | KEEP | Phase 08E deny-by-default authorization policy boundary with separate global and branch-aware decisions. OWN scope remains denied until patient ownership is explicitly implemented. |
| `docs/architecture/authorization-rbac-foundation.md` | KEEP | Records Phase 08E role grants, branch enforcement, System Administrator restrictions, owner-dentist role union, and the Phase 08F Express authorization composition boundary. |
| `server/src/access/accessMiddleware.ts` and `accessRuntime.ts` | KEEP | Phase 08F Express-facing access composition. Resolves authenticated provider identity to active application user and RBAC context, then enforces global/branch permissions before handlers. Runtime PostgreSQL configuration remains lazy. |
| `server/src/access/*.js`, `server/src/postgres/{config,pool}.js`, `server/src/repositories/{applicationUserRepository,authorizationRepository,staffAccountRepository,auditEventRepository}.js`, and related `server/src/services/*.js` re-exports | BRIDGE | Thin JS-to-TS compatibility bridges required by the current plain-Node server entrypoint. Retire when the server runtime/import strategy no longer requires them. |
| `server/src/routes/auth.js` Phase 08F `/access` boundary | KEEP | Minimal RBAC probe requiring active application-user resolution and GLOBAL `user.read`; returns only `{ authorized: true }` and leaves `/session` unchanged. |
| `server/src/routes/staffAccounts.js` | KEEP | Phase 08G protected Clinic Administrator staff-account creation route. Requires `staff_account.create` plus `role_assignment.approve` and creates only pending Personnel/Dentist application records. |
| `server/src/services/staffAccountManagementService.ts`, `server/src/repositories/staffAccountRepository.ts`, and `server/src/staff/staffAccountRuntime.ts` | KEEP | Phase 08G transactional pending-staff creation foundation using existing 08D user/role/branch tables. Managed-auth provisioning, passwords, and provider secrets remain outside this phase. |
| `docs/architecture/staff-account-management-foundation.md` | KEEP | Records the Phase 08G pending staff workflow, allowed operational roles, safe response contract, transactional behavior, and deferred managed-auth provisioning gate. |
| `server/src/postgres/migrations/0007_append_only_audit_foundation.sql` | KEEP | Phase 08H append-only security/account audit schema with immutable UPDATE/DELETE trigger and actor/target/time lookup indexes. |
| `server/src/repositories/auditEventRepository.ts` and `server/src/services/auditEventService.ts` | KEEP | Phase 08H server-generated audit insert boundary. Validates identifiers, blocks secret-shaped metadata, and records safe account-management events through parameterized PostgreSQL writes. |
| `docs/architecture/audit-foundation.md` | KEEP | Records the Phase 08H append-only audit model, sensitive-data exclusions, transactional staff-account integration, and the next Supabase provisioning gate. |
| Existing V1 clinic routes in `server/src/routes/*.js` | RETIRE-LATER | They remain unauthenticated local-runtime paths until focused protected-route replacement/integration tasks are complete; the new auth router is the intentional exception. |

## Patient Domain

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/postgres/migrations/0002_branch_patient_core.sql` | KEEP | Batch A foundation migration for normalized branch and patient PostgreSQL structures; later phases should extend with new ordered migrations only. |
| `server/src/postgres/batchA/*.ts` | KEEP | Dedicated PostgreSQL branch/patient foundation and fictional parity helpers; Phase 07A also reuses this mapping layer for V2 Patient reads. |
| `server/src/repositories/patientRepository.ts` | KEEP | Phase 07A/07B typed PostgreSQL Patient repository boundary for reads plus branch checks, annual code allocation, insert, and immutable-identity update operations. |
| `server/src/services/patientReadService.ts` | KEEP | Phase 07A internal V2 Patient read service; intentionally not wired to the unauthenticated V1 HTTP route yet. |
| `server/src/services/patientWriteRules.ts` | KEEP | Phase 07B typed V2 Patient write normalization/validation boundary preserving applicable V1 patient rules while using UUID branch identity. |
| `server/src/services/patientWriteService.ts` | KEEP | Phase 07B/07C internal V2 Patient create/update service; owns transaction orchestration, UUID creation, annual code allocation, branch validation, immutable patient identity/code behavior, and safe persistence-error translation. Not wired to V1 routes yet. |
| `server/src/services/patientDomainService.ts` | KEEP | Phase 07C internal Patient facade for future authenticated controllers; provides typed not-found behavior and composes the hardened read/write services without exposing repository details. |
| `server/src/services/patientDomainErrors.ts` and `patientIdentity.ts` | KEEP | Phase 07C typed safe domain errors plus UUID/readable-code validation before PostgreSQL access. |
| `docs/architecture/patient-cutover-readiness.md` | KEEP | Records completed Patient persistence/domain work and the authentication, authorization, audit, protected-route, E2E, migration-verification, and UAT gates that still block route cutover. |
| Patient JSX pages and components | RETIRE-LATER | Working V1 UI remains active until a V2 patient slice exists. |
| `server/src/routes/patients.js` | RETIRE-LATER | Active legacy route surface; replacement should happen with V2 persistence and auth. |
| `server/src/services/patientService.js` | REPLACE | Current service is tightly aligned to legacy persistence assumptions. |
| `server/src/utils/patientUtils.js` | ADAPT | Candidate for targeted reuse if utility behavior remains stable. |

## Treatment Domain

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/postgres/migrations/0003_treatment_core.sql` | KEEP | Batch B Treatment foundation migration; extend only through later ordered migrations. |
| `server/src/postgres/batchB/*.ts` | KEEP | Dedicated PostgreSQL Treatment foundation and fictional parity helpers; no runtime cutover yet. |
| Treatment JSX pages and components | RETIRE-LATER | Leave active until a V2 treatment slice is ready. |
| `server/src/routes/treatments.js` | RETIRE-LATER | Route replacement should align with V2 persistence and auth. |
| `server/src/services/treatmentService.js` | REPLACE | Strongly coupled to current V1 persistence workflow. |

## Attachments

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/utils/attachmentUtils.js` | REPLACE | V2 private storage and metadata flow likely require a new foundation. |
| `server/src/routes/attachments.js` and treatment attachment route logic | RETIRE-LATER | Keep until secure private-storage replacement is live. |
| `server/src/services/attachmentService.js` | ADAPT | Some workflow logic may remain useful after storage changes. |

## Dashboard And Reporting

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/services/dashboardService.js` | ADAPT | Business filtering logic may be reusable behind new persistence. |
| `server/src/routes/dashboard.js` | ADAPT | Route shape may remain a useful reference, but auth and persistence will change. |
| `client/src/pages/DashboardPage.jsx` | RETIRE-LATER | Current page can stay until a V2 dashboard slice is built. |

## Backup And Export

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/services/exportService.js` | ADAPT | Export shaping logic may survive with repository changes underneath. |
| `server/src/routes/exports.js` | ADAPT | Route behavior may remain useful, but access controls will tighten later. |
| `server/src/services/backupService.js` | REPLACE | Local backup model does not match the target cloud-ready architecture. |
| `server/src/routes/backup.js` | REPLACE | Restore and backup control flow will need redesigned V2 handling. |

## Shared Client API

| Area | Classification | Notes |
| --- | --- | --- |
| `client/src/lib/api.js` | REPLACE | Central API surface will likely change materially with auth and V2 service boundaries. |

## Server Validation And Utilities

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/utils/validation.js` | ADAPT | Good candidate for continued reuse with typed contracts. |
| `server/src/utils/dateUtils.js` | KEEP | Stable utility with low coupling to upcoming architecture changes. |

## Runtime Configuration, Bootstrap, And Database Layer

| Area | Classification | Notes |
| --- | --- | --- |
| `server/src/config/runtimeConfig.js` | ADAPT | Runtime configuration will change, but the boundary itself remains useful. |
| `server/src/app.js` | RETIRE-LATER | Active V1 server bootstrap until V2 server composition is ready. |
| `server/src/index.js` | RETIRE-LATER | Leave in place until the new runtime path is proven. |
| `server/src/db/database.js` | RETIRE-LATER | SQLite-specific data access should not be migrated broadly just to be rewritten for PostgreSQL. |

## Notes

- Do not convert legacy SQLite-oriented architecture solely to increase the
  TypeScript percentage.
- Batch 5 proved that a TypeScript service slice can coexist safely with
  JavaScript routes and current SQLite runtime paths.
- Future PostgreSQL and vertical-slice prompts should use this map to decide
  whether a legacy area should be reused, adapted, bridged, replaced, or
  retired later.
