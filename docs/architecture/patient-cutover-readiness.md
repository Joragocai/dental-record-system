# V2 Patient Domain Cutover Readiness

## Status

The V2 Patient domain is persistence-ready but is not approved for HTTP route cutover yet.

Completed internal capabilities:

- PostgreSQL-backed Patient list, search, UUID lookup, and readable-code lookup.
- PostgreSQL-backed Patient create and update.
- UUID internal identity with immutable readable `P-YYYY-0001` Patient codes.
- Transactional annual Patient-code allocation.
- Explicit branch UUID relationships and branch-existence validation.
- Plain `YYYY-MM-DD` Patient date semantics and null normalization.
- Applicable V1 Patient validation/business-rule parity.
- Typed internal Patient-domain errors that avoid exposing database-driver details.
- Internal Patient domain facade for future authenticated controllers.
- Validation of UUID and readable Patient-code identities before PostgreSQL access.
- PostgreSQL integration coverage for reads, writes, rollback behavior, and concurrent Patient-code allocation using fictional data.

## Current Runtime State

The active route `server/src/routes/patients.js` still uses the V1 SQLite Patient service. This is intentional. Phase 07C does not expose the PostgreSQL Patient domain through the current unauthenticated HTTP surface.

## Remaining Cutover Blockers

Before the PostgreSQL Patient domain replaces the V1 Patient route, the following gates remain:

1. Authentication must protect Patient routes.
2. Authorization must enforce role, branch, ownership, and Patient-access rules before data access.
3. Sensitive Patient reads and writes must create the approved append-only audit events.
4. Protected TypeScript controllers/routes must map Patient-domain results and errors to safe HTTP responses.
5. Route-level integration tests must cover unauthenticated, unauthorized, cross-branch, and allowed Patient access.
6. End-to-end tests must cover the affected clinic workflow using fictional data.
7. Migration verification must confirm the PostgreSQL Patient data used for cutover matches the approved source state.
8. Clinic user acceptance must confirm the Patient workflow before the SQLite route is retired.

## Retirement Rule

Do not remove `server/src/routes/patients.js`, `server/src/services/patientService.js`, SQLite Patient persistence, or current client consumers until the replacement route is active and the repository retirement gates are satisfied.
