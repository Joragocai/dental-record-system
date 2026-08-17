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
| `server/src/services/appointmentService.ts` | ADAPT | Useful typed domain and service base for future replacement slices. |
| `server/src/services/appointmentService.js` | BRIDGE | Preserve while JavaScript route consumers still import it. |
| `server/src/routes/appointments.js` | RETIRE-LATER | Active V1 route path; replacement depends on broader V2 API and auth work. |
| Appointment JSX UI files | RETIRE-LATER | Current UI can remain until the V2 appointment slice is implemented. |
| Appointment API calls in `client/src/lib/api.js` | RETIRE-LATER | Likely to change during V2 API and auth transition. |
| Appointment logic in `server/src/db/database.js` | RETIRE-LATER | Persistence path is tied to SQLite and should not be converted further just for parity. |

## Patient Domain

| Area | Classification | Notes |
| --- | --- | --- |
| Patient JSX pages and components | RETIRE-LATER | Working V1 UI remains active until a V2 patient slice exists. |
| `server/src/routes/patients.js` | RETIRE-LATER | Active legacy route surface; replacement should happen with V2 persistence and auth. |
| `server/src/services/patientService.js` | REPLACE | Current service is tightly aligned to legacy persistence assumptions. |
| `server/src/utils/patientUtils.js` | ADAPT | Candidate for targeted reuse if utility behavior remains stable. |

## Treatment Domain

| Area | Classification | Notes |
| --- | --- | --- |
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
