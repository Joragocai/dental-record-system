# PostgreSQL Appointment Batch C

## Scope

Batch C adds the next narrow PostgreSQL domain-data slice on top of the
committed foundation and the completed Patient/Treatment batches:

- `appointments`
- `legacy_appointment_identity_map`
- fictional V1 SQLite to V2 PostgreSQL appointment migration/parity validation

This batch does not cut over the active V1 SQLite Appointment runtime, routes,
services, or UI.

## Identity Strategy

- `appointments.id` is the internal V2 UUID primary key.
- V1 has no visible appointment business code, so Batch C does not invent one.
- legacy SQLite appointment row identity remains legacy-only and is preserved in
  `legacy_appointment_identity_map`.
- `legacy_appointment_identity_map` provides the durable rerun/reference seam:
  `source_system + legacy appointment row id -> V2 appointment UUID`.

## Patient Relationship

- V2 Appointment rows reference `patients.id`.
- fictional Batch C migration accepts legacy V1 `patient_id` only as migration
  input.
- patient resolution must succeed through the Batch A
  `legacy_patient_identity_map` seam.
- missing or conflicting patient mappings fail before Appointment insertion.

## Branch Snapshot Rule

V1 appointments do not persist an independent branch field. V1 read behavior
derives branch through the related patient record.

Batch C therefore stores `appointments.branch_id` as the migration-time branch
snapshot of the already migrated V2 Patient:

- resolve legacy appointment `patient_id` through Batch A
- read that migrated V2 Patient's `branch_id`
- store the same branch UUID on the migrated Appointment row

This is deterministic and does not inspect free-text appointment fields or
fuzzy-match branches. If the patient mapping is missing, conflicting, or does
not resolve to a valid migrated Patient branch relationship, migration fails
before write.

Because V1 did not preserve appointment-specific historical branch identity,
migrated Batch C branch values represent the Patient's authoritative mapped
branch at migration time.

## Treatment / Provider Relationship Decisions

- V1 appointments do not persist a treatment reference, so Batch C does not add
  a Treatment FK.
- V1 appointments do not persist a provider/dentist reference, so Batch C does
  not invent one.

## Field-Mapping Summary

| V1 field | V2 field | Rule |
| --- | --- | --- |
| `id` | omitted from domain table | legacy SQLite row identity stays in `legacy_appointment_identity_map`, not the V2 PK |
| `patient_id` | `patient_id` | resolve from V1 patient code through Batch A legacy map to V2 patient UUID |
| derived from migrated Patient | `branch_id` | store migrated Patient branch as the deterministic migration-time snapshot |
| `appointment_date` | `appointment_date` | preserve as PostgreSQL `DATE` |
| `appointment_time` | `appointment_time` | preserve local wall-clock `HH:MM`; blank/whitespace -> `NULL` |
| `planned_procedure` | `planned_procedure` | blank/whitespace -> `NULL`, otherwise preserve |
| `notes` | `notes` | blank/whitespace -> `NULL`, otherwise preserve |
| `status` | `status` | blank -> legacy `Scheduled`, then map legacy values into V2 machine statuses: `Scheduled` -> `confirmed`, `Completed` -> `completed`, `Cancelled` -> `cancelled_by_clinic`, `No-show` -> `no_show` |
| `created_at` | `created_at` | accept proven V1 legacy timestamp forms and normalize to `TIMESTAMPTZ` |
| `updated_at` | `updated_at` | accept proven V1 legacy timestamp forms and normalize to `TIMESTAMPTZ` |

## Date / Time / Timestamp Rules

- `appointment_date` uses PostgreSQL `DATE`
- `appointment_time` uses PostgreSQL `TIME` and preserves local clinic wall-clock semantics
- blank appointment time becomes `NULL`
- `created_at` / `updated_at` use PostgreSQL `TIMESTAMPTZ`
- accepted legacy timestamp inputs are limited to:
  - JS ISO timestamps such as `2026-08-20T08:30:00.000Z`
  - SQLite `CURRENT_TIMESTAMP` form `YYYY-MM-DD HH:MM:SS`
- unrelated ambiguous timestamp formats are rejected
- Asia/Manila remains the clinic/business timezone context for later runtime
  scheduling behavior; Batch C does not reinterpret appointment date/time as a
  combined instant

## Status / History Semantics

- Legacy Batch C migration input still accepts only the existing V1 appointment status values:
  - `Scheduled`
  - `Completed`
  - `Cancelled`
  - `No-show`
- The Batch C migration helper now maps those legacy labels into the Phase 12 V2 machine statuses before PostgreSQL insertion:
  - `Scheduled` -> `confirmed`
  - `Completed` -> `completed`
  - `Cancelled` -> `cancelled_by_clinic`
  - `No-show` -> `no_show`
- no separate appointment history table exists in V1
- Phase 12 migration `0011_appointment_workflow_redesign.sql` adds append-only `appointment_history` for future V2 workflow events; legacy rows are translated, not retroactively given invented history

## Transactional And Rerun Behavior

- Appointment row insertion and legacy identity-map insertion occur in one
  PostgreSQL transaction
- rerunning the same fictional source Appointment reuses the existing migrated
  row only when the persisted Batch C parity state matches exactly
- conflicting legacy identity or conflicting matching appointment state without
  a legacy map fails clearly
- no silent overwrite path exists

## Double-Booking Findings

- V1 has no persisted double-booking enforcement
- Batch C does not implement the later V2 transaction-safe booking service
- Batch C only adds narrow indexes that are safe for parity and historical data
- future runtime booking enforcement remains a required later Appointment-domain
  replacement behavior

## Phase 12 Handoff

Phase 12 Appointment Redesign is now approved under
`docs/codex-prompts/12-Appointment-Redesign.txt`. It must extend this Batch C
foundation through a new ordered migration rather than editing migration 0004.

The approved Phase 12 direction is:

- preserve clinic-wide Patient UUID identity and explicit appointment branch;
- add a nullable Dentist application-user relationship for requests that do not
  yet have a final provider;
- add duration for slot-reserving appointments;
- move persisted status to stable V2 machine values while safely translating
  the four legacy values;
- add append-only appointment business history and centralized audit events;
- enforce Dentist branch membership and transaction-safe overlapping-slot
  conflict prevention across branches;
- replace the legacy SQLite appointment runtime/API/UI only after the protected
  PostgreSQL replacement passes its retirement gates.

Notifications remain Phase 13 and patient self-service appointment workflows
remain Phase 14.

## Known Limitations

- active Appointment runtime still uses SQLite until the Phase 12 replacement is implemented and verified
- no protected V2 Appointment service/API/UI cutover exists yet
- migration 0011 extends the Batch C schema to the approved V2 machine-status set and adds appointment history/provider/duration foundations
- Phase 12B now adds a separate TypeScript PostgreSQL appointment repository/domain service with explicit workflow transitions, branch/provider validation, append-only history + audit writes, and transaction-scoped Dentist/date conflict serialization across branches
- protected hosted HTTP route mounting remains deferred to Phase 12C, so the active hosted API still does not expose V2 appointment routes
- no Treatment linkage exists because V1 does not persist one
- real-data migration still depends on the reviewed production migration plan and downstream V2 runtime work
