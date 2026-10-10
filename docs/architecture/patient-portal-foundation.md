# Phase 14 Patient Portal — Proposed Security Architecture

Status: Phase 14A LOCAL IMPLEMENTATION IN PROGRESS (October 10, 2026); not yet approved for staging migration, provider invitation, or deployment. README.md is authoritative; this design supports docs/codex-prompts/14-Patient-Portal.txt.

## Baseline verified
- Supabase Auth verifies bearer identities; app_users has UUID, optional auth_user_id, status, and assigned roles.
- PATIENT role exists but has no effective permissions. Generic OWN checks intentionally deny with AUTHORIZATION_OWNERSHIP_NOT_IMPLEMENTED.
- patients.id is the clinic-wide patient UUID; patients.branch_id records registration origin, not exclusive ownership.
- Staff provisioning supports only PERSONNEL/DENTIST (and special initial owner activation) and must not be broadened implicitly.
- Patient PostgreSQL domain is internal; old routes are legacy SQLite and not exposed by the hosted application.
- Phase 12 appointment API is staff BRANCH-scoped. Phase 13B email intent delivery is pending with real worker off; Phase 13D exposes recipient-owned in-app notifications, with remaining hosted cross-user QA deferred to Phase 19.
- Treatment row lacks a reviewed patient-publication flag; attachments include is_patient_visible plus private storage status. Invoice/payment ledgers are reserved for Phase 15.

## Proposed trust boundaries

```text
Clinic-authorized patient verification and invitation
 -> explicit selected existing patients.id + audited approval
 -> pending app_users PATIENT only + unique pending patient_account link
 -> backend-only Supabase Auth invite with constrained redirect
 -> Supabase email verification + patient-chosen password
 -> backend checks verified provider UUID/email and pending association
 -> transactionally activate exact app user/link + append-only audit
 -> subsequent /api/me requests:
    verified bearer -> active app_user -> exactly one active patient link
    -> PATIENT OWN permission -> SQL constrained to resolved patient UUID
    -> server-built patient-visible DTO -> response
```

No clinical data access before activation. Auth JWT, email, patient code, phone, birthday, clinic branch, and frontend parameters cannot establish patient ownership. Prefer an explicit association table with unique app_user_id and patient_id, named patient_accounts if confirmed in the schema review. Consider lifecycle/revocation and email-change reconciliation; existing staff service may be reused only for provider mechanics, not policy shortcuts.

### Patient identity verification (decision needed before implementation)
Define how authorized clinical personnel confirm that an email address is legitimately controlled by the patient, record approval without copying ID documents into logs, and address minors/guardians (guardian support intentionally out of scope). Do not assume that owning an email or knowing demographics proves consent to link the complete dental history. Define missing-email, already-invited, duplicate-match, and mistaken-link recovery rules. Decide explicit clinic roles capable of approving linking without granting Clinic Administrator clinical visibility by implication.

### Permission isolation
Create narrowly scoped PATIENT permissions for own profile, own published treatments, own appointment summaries/requests, and own published documents. Use a specific server-side OWN evaluator that first resolves the linked patient UUID. Do not turn existing generic OWN checks into unconditional allow. Server handlers do not accept a caller-supplied patientId as an authority; SQL always includes the resolved patient UUID, including object ID access. Maintain owner-dentist's separate Dentist/Clinic Administrator authority and System Administrator's non-clinical access.

### Data release
Use dedicated patient-safe response schemas, not direct serialization of patients/treatments/appointments/attachments rows. Treatment publication must be explicit and dentist-controlled; default no patient visibility for past records. Do not reveal internal notes, full audit events, object keys, staff-only appointment notes, treatment finance fields, medical data beyond approved patient-facing content, or rows for another patient. Patient document downloads require reauthorization for each signed URL and private Storage.

### Appointment requests
Patient may request an appointment and request cancellation/rescheduling of an existing owned appointment. A request is not a clinical staff decision. Preserve Phase 12 state machine, scheduling constraints, history and audit; design a durable request model if existing appointment history cannot express pending cancellation/rescheduling. Require a clinic-approved cutoff policy before enforcement. Use service-location branch, not registration branch. Record correlation/dedupe and avoid accidental duplicate reservations. Do not activate email worker.

### Finance dependency and honest delivery
Balance/payment history is approved portal scope but authoritative invoice/payment tables are Phase 15. Until Phase 15 integration is approved, omit those screens or label them unavailable; do not treat treatment.balance as the financial ledger or show a fake PHP 0 balance. Full Phase 14 completion remains dependent on the later finance integration gate.

## Phase 14A proposed acceptance checklist
- Clinic-confirmed verification procedure and authorization matrix, including minor/guardian deferral.
- New additive migration, uniqueness, FK constraints, revocation safety, transactional audit/idempotency; no mutation of applied migrations.
- Separate patient invitation and activation services, no public sign-up, server-only provider secrets and approved redirects.
- Pending, suspended, deactivated, mismatched and unlinked principals denied patient record access.
- Two fictional patient/user identities using isolated TEST_DATABASE_URL validate role restrictions, cross-user isolation, guessed UUID/code attacks, concurrency, provider split-brain recovery and audit.
- Typecheck, build, relevant regressions, independent senior review, and human approval for migration, deploy, commit and push.
- Hosted real-user testing remains a later gate, including Phase 19 deferred Phase 13D checks.

## Current local Phase 14A implementation (not hosted)
- Local migration `0013_patient_portal_ownership.sql` creates unique patient-to-app-user links and PATIENT-only OWN grants; no migration applied to staging.
- Protected `POST /api/patient-enrollments` is mounted only in the hosted V2 routing tree and requires existing Personnel/Dentist patient permissions. A staff operator supplies a patient UUID, the already-recorded patient email, and explicit in-person identity, email-control, and consent attestations. The service checks age 18+, matching clinic-record email, patient registration-branch access for the verifier, duplicate accounts, and inserts a pending PATIENT account/link plus a correlated audit event transactionally.
- **Manual verification has not yet been certified:** attestation booleans are staff assertions, not cryptographic or independent proof. The clinic must approve a documented verification/consent procedure before any real-data account creation. A patient must never activate or see data solely because a staff assertion was submitted.
- New owned patient resolution is isolated to a dedicated fail-closed service, not the existing generic OWN evaluator. A hosted-only backend patient self-activation endpoint is implemented but not deployed; it independently checks Supabase confirmed-email status and authenticated subject before transactionally activating a pending patient-only link. A clinic-staff-authorized patient invitation API and separate patient browser activation page now exist locally; provider access is server-only and activation requires a freshly confirmed Supabase identity. No patient clinical-data route exists. Provider handoff ambiguity retains `reconciliation_required` state rather than unsafe automatic retries. Supabase patient redirect allowlisting and hosted deployment require separate approval; follow `docs/deployment/patient-portal-staging-gate.md` for the exact manual procedure.
- Unit tests with fictional data cover recipient isolation, enrollment rejection/safe audit failure, invitation-state idempotency and verified-provider email rejection. The local Phase 14A focused suite currently passes 15 tests. Hosted real PostgreSQL integration, authenticated route-level negative tests, provider conflict/reconciliation concurrency, browser-hosted patient invitation activation QA, provider-concurrency/integration testing and separate security review remain outstanding. Comprehensive hosted manual QA is deferred to Phase 19; authentication and ownership correctness remain implementation security gates.

## Phase 14B local implementation (not staged)
- Local migration `0014_patient_portal_publication.sql` introduces default-hidden patient treatment summaries and Dentist-only publication; migration is unapplied. Both 0013 and 0014 are required before hosted access.
- `/api/me/patient-profile` GET/PATCH, `/api/me/treatments` GET, and `/api/me/appointments` GET use a dedicated OWN resolver and whitelisted columns. Each sensitive read and contact change is append-only audited. Treatment summaries are selected only when `patient_visible = TRUE`. Finance, internal notes, medical alerts and private object keys are excluded.
- A Dentist-only publish route checks branch access before writing a 1–1000 character patient-safe summary and an audit event. The current treatment data model has no treatment-specific branch field; publishing is conservatively restricted to the patient's registration-branch Dentist until a reviewed treatment-branch attribution policy is available.
- `/patient-portal` is locally built, but no hosted rollout has occurred. Manual hosted QA remains deferred to Phase 19. Isolated test PostgreSQL configuration is missing, so migrations and transactional ownership/audit guarantees have not yet passed real-database tests. Do not claim Phase 14B security approval or apply migrations without that gate.

## Phase 14C local request and clinic review workflow (not staged)
- Migration `0015_patient_appointment_requests.sql` adds durable pending cancellation/rescheduling intent records and separate creation idempotency records; both include PostgreSQL constraints for uniqueness and referential integrity. New appointment requests persist Phase 12 `requested` status plus history, without reserving confirmed slots or changing existing confirmed appointments.
- OWN-scoped `/api/me` routes allow patients to submit and list requests; the `/patient-appointments` UI uses authorized clinic branches and the patient's own appointment list. Requests cannot select privileged appointment statuses.
- Protected clinic review endpoints and `/clinic-patient-requests` frontend are implemented locally. An authorized Dentist/Personnel can review pending requests at assigned appointment branches. Approvals reuse the Phase 12 domain services within the same outer PostgreSQL transaction that records the clinic decision, appointment history, notifications and append-only audit; any failure rolls back the decision. Rejecting only updates the request state and writes audit. The new request tables enforce PostgreSQL RLS without client access policies. Unit tests cover staff/branch denial and atomic rejection/failure; real PostgreSQL migration, concurrency and cross-user integration are still required for security certification.
- Manual intervention is centralized in `docs/deployment/patient-portal-staging-gate.md` and deferred to Phase 19. No migrations or deployment were performed.

## Phase 14D local documents and privacy (not staged)
- The Phase 10 private attachment adapter is reused server-side only. A dedicated patient OWN resolver scopes list and per-download queries to the linked patient UUID, requires `is_patient_visible=TRUE`, `status='uploaded'`, and `deleted_at IS NULL`, and returns only safe metadata. A row-locked authorization check precedes issuance of a short-lived Supabase signed download URL. Signing and request-correlated auditing run within a transaction. Browser clients never receive an object key or private service secret.
- Dentist-only document publication/hiding uses the existing `attachment.update` BRANCH permission, enforces the attachment branch, and append-only audits visibility changes. No automatic publication of previously uploaded files.
- The `/patient-documents` page shows published documents, sign-out, basic privacy guidance, and optional account self-deactivation. Deactivation transactionally marks the patient account revoked and app user deactivated with an audit entry while retaining patient history. Reactivation, unlink/relink, provider token revocation and detailed retention/consent/privacy policy require clinic decisions. Previously issued signed URLs may remain usable until expiry.
- Phase 15 finance is not present; authoritative `/api/me/balance` and `/api/me/payments` are intentionally absent. Phase 14D does not claim the full Phase 14 portal/finance release complete. Hosted multi-user and isolated PostgreSQL integration gates are outstanding and tracked in `docs/deployment/patient-portal-staging-gate.md`.

## Unresolved design decisions
1. Which authorized clinical roles approve initial patient-account binding, and what documented verification is sufficient?
2. How to handle patient email changes, unlinking and incorrect associations without exposing past records or granting account takeover?
3. Whether minors/guardians should be excluded from initial portal activation until a separate specification.
4. What clinic appointment cancellation/rescheduling cutoff and approval rules apply?
5. How patient documents and treatment publication are approved when old rows have no publication metadata.

Do not implement 14A until these identity/authorization decisions are reviewed. No account invitations, migrations, staging mutations or email-provider changes are authorized by this architecture document.
