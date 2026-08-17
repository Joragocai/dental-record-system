# PostgreSQL Treatment Batch B

## Scope

Batch B adds the next narrow PostgreSQL domain-data slice on top of the
committed foundation and Batch A patient work:

- `treatment_code_counters`
- `treatments`
- `legacy_treatment_identity_map`
- fictional V1 SQLite to V2 PostgreSQL treatment migration/parity verification

This batch does not cut over the active V1 SQLite Treatment runtime, routes,
services, or UI.

## Identity Strategy

- `treatments.id` is the internal V2 UUID primary key.
- `treatments.treatment_code` preserves the visible V1 business identifier
  format `T-YYYY-0001`.
- legacy SQLite integer Treatment row IDs remain legacy identity only.
- `legacy_treatment_identity_map` preserves durable
  `source_system + legacy row id + legacy treatment code -> V2 UUID` identity
  for reruns and later attachment/downstream migration work.

## Patient Relationship Strategy

- V2 Treatment rows reference `patients.id`.
- fictional Batch B migration accepts the legacy V1 `patient_id` business code
  only as migration input.
- patient resolution must succeed through the Batch A
  `legacy_patient_identity_map` seam.
- missing or conflicting patient mappings fail before Treatment insertion.

## Treatment Code Allocation

The V1 visible Treatment-code behavior is preserved:

- format: `T-YYYY-0001`
- clinic-wide annual sequence
- reset on each new calendar year

Batch B uses a dedicated `treatment_code_counters` table with an atomic upsert.
This preserves the visible format while removing V1 last-row lookup races.
Calendar-year decisions use the approved clinic/business timezone
`Asia/Manila` unless `CLINIC_TIMEZONE` explicitly overrides it.

## Field-Mapping Summary

| V1 field | V2 field | Rule |
| --- | --- | --- |
| `id` | omitted from domain table | legacy SQLite row identity stays in `legacy_treatment_identity_map`, not the V2 PK |
| `treatment_id` | `treatment_code` | preserve exactly |
| `patient_id` | `patient_id` | resolve from V1 patient code through Batch A legacy map to V2 patient UUID |
| `treatment_date` | `treatment_date` | preserve as PostgreSQL `DATE` |
| `tooth_numbers` | `tooth_numbers` | blank/whitespace -> `NULL`, otherwise preserve |
| `next_appointment` | omitted as standalone column | fallback input only; canonical date stored in `next_appointment_date` |
| `next_appointment_date` | `next_appointment_date` | use explicit value first, fallback to legacy `next_appointment`, blank -> `NULL` |
| `next_appointment_time` | `next_appointment_time` | blank -> `NULL`, preserve `HH:MM` when present |
| `procedure` | `procedure` | required text, preserve |
| `dentists` | `dentists` | required text, preserve current persisted provider text |
| `amount_charged` | `amount_charged` | preserve as `NUMERIC(12,2)` |
| `discount_type` | `discount_type` | blank -> `None`, preserve allowed V1 values |
| `discount_percent` | `discount_percent` | preserve when present, otherwise derive from V1 discount defaults |
| `discount_amount` | `discount_amount` | preserve when present, otherwise derive |
| `net_amount_due` | `net_amount_due` | preserve when present, otherwise derive |
| `amount_paid` | `amount_paid` | preserve as `NUMERIC(12,2)` |
| `balance` | `balance` | preserve when present, otherwise derive |
| `remarks` | `remarks` | blank/whitespace -> `NULL`, otherwise preserve |
| `created_at` | `created_at` | preserve as `TIMESTAMPTZ` |
| `updated_at` | `updated_at` | preserve as `TIMESTAMPTZ` |

## Date, Timestamp, And Money Rules

- business dates use PostgreSQL `DATE`
- timestamps use PostgreSQL `TIMESTAMPTZ`
- optional blank legacy text normalizes to `NULL`
- money fields remain on the Treatment record for parity in this batch and use
  `NUMERIC(12,2)`
- Batch B does not introduce Finance ledger behavior

## Transactional And Rerun Behavior

- Treatment row insertion and legacy identity-map insertion occur in one
  PostgreSQL transaction.
- rerunning the same fictional source Treatment reuses the existing migrated row
  when the persisted Batch B parity state matches exactly.
- conflicting legacy row/code/UUID states fail clearly.
- conflicting `treatment_code` without a matching legacy identity map fails
  clearly.
- no silent overwrite path exists.

## Fictional Migration Harness

Batch B adds dedicated TypeScript helpers under `server/src/postgres/batchB/`
for:

- annual Treatment code allocation
- field mapping/canonicalization
- patient UUID resolution through Batch A
- atomic fictional Treatment migration
- isolated unit and live PostgreSQL integration validation

## Known Limitations

- active Treatment runtime still uses SQLite
- no Treatment service/API/UI cutover exists yet
- Appointment, Finance, attachment, and staff-identity PostgreSQL work remain
  deferred
- real-data migration still depends on a reviewed production migration plan and
  approved downstream identity dependencies
