# PostgreSQL Patient Batch A

## Scope

Batch A establishes the first PostgreSQL domain-data slice on top of the
committed foundation:

- normalized `branches`
- `patients`
- concurrency-safe annual `patient_code_counters`
- `legacy_patient_identity_map` for future referential migration
- fictional V1 SQLite to V2 PostgreSQL patient migration/parity verification

This slice does not cut over active V1 services, routes, UI, or SQLite writes.

## Identity Strategy

- `patients.id` is the internal V2 UUID primary key.
- `patients.patient_code` preserves the visible V1 business code format
  `P-YYYY-0001`.
- legacy SQLite integer patient row IDs are not promoted to V2 public identity.
- `legacy_patient_identity_map` preserves durable SQLite row/code to V2 UUID
  mapping for later Treatment and Appointment migration phases.

## Branch Mapping Rule

V1 stores branch as free-text `branch_location`. Batch A does not invent a real
production branch list or silently normalize legacy values.

Migration/parity behavior requires:

- an explicit `branch_location -> branch_id` mapping supplied by the migration
  harness
- a resolved target UUID that already exists in `branches`
- a hard failure before patient insertion when a legacy branch value is missing
  from the supplied mapping

Real-data migration remains blocked until the clinic's canonical production
branch list and approved mapping are available.

## Patient Code Allocation

The V1 visible patient-code semantics are preserved:

- format: `P-YYYY-0001`
- sequence starts at `0001`
- sequence is clinic-wide for the calendar year
- sequence resets when a new year begins

PostgreSQL allocation uses an atomic upsert on `patient_code_counters` instead
of V1's last-row lookup pattern, which avoids race conditions without changing
the visible format.

## Data-Parity Rules

- Every persisted V1 patient field remains represented in the Batch A PostgreSQL
  patient structure.
- V1 integer checklist condition fields migrate to PostgreSQL booleans.
- Existing V1 date strings are accepted only in ISO `YYYY-MM-DD` form.
- Existing V1 timestamps are accepted only as ISO timestamps.
- Optional legacy blank or whitespace-only strings normalize to `NULL` in V2.
- Rerunning the same legacy patient migration reuses the existing matching
  migrated patient and identity map; conflicting legacy identity or patient-code
  state fails clearly.
- Fictional migration tests verify field-level parity, branch resolution, annual
  code allocation, and legacy identity-map creation.
