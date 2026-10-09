# Khurana Calliap Dental Record System

## Cloud-Ready V2 Product Requirements, Architecture, Security, Deployment, and Codex Development Guide

This document is the main technical and functional specification for developing the next version of the Khurana Calliap Dental Record System.

It is written for use by the project developer and by Codex. Codex should treat this README as the primary implementation guide unless a later, explicitly approved requirement overrides it.

> **Important:** The current application is designed for local use only. It must not be exposed publicly or used with real patient data in a public environment until authentication, authorization, private file storage, audit logging, database migration, backups, and security controls described in this document are implemented and tested.

> **Approved notification scope:** The initial V2 system uses in-app notifications and transactional email. SMS is intentionally excluded unless a later approved requirement and budget review reintroduces it.

---

## 1. Project Purpose

The system is a browser-based clinic management and dental record application that replaces the clinic's previous Excel/VBA workflow.

The target system must support:

- Secure online access through desktop, laptop, tablet, and smartphone devices
- Patient record management
- Treatment and clinical record management
- Appointment requesting, confirmation, cancellation, and rescheduling
- Patient self-service access to patient-visible personal records
- Role-based staff access
- Clinic-controlled administration, technical maintenance, and audit trails
- Payment, invoice, receivable, collectible, and expense tracking
- Daily financial summaries and cash closing
- Patient and Treatment Files
- Direct mobile camera capture for documents and photos
- Print, PDF, and Excel exports
- Reliable backups and recovery
- Multi-branch readiness
- Production deployment with PostgreSQL and private cloud storage

---

## 2. Current System Summary

### 2.1 Current Technology

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Current source language: JavaScript / JSX
- V2 source-language target: TypeScript / TSX through an incremental migration
- Database: SQLite through Node's built-in `node:sqlite`
- Upload storage: Local filesystem
- Excel export: `exceljs`
- PDF generation: `html2canvas` and `jsPDF`
- Current runtime: Localhost on a clinic computer or laptop

### 2.2 Current Project Structure

```text
dental-record-system/
  client/
  server/
  data/
    dental.db
  uploads/
    patients/
    treatments/
  exports/
  backups/
  README.md
```

> **V2 branch cleanup:** Legacy Windows launcher files such as
> `Start Dental System.bat`, `Backup System.bat`, other `.bat` launchers, and
> `startDemo.txt` must be removed from the active V2 branch. They
> remain recoverable from the preserved `v1-local-stable` Git tag if the old
> local workflow must be reviewed. Codex must not recreate them unless an
> explicitly approved legacy-maintenance task requires it.

### 2.3 Current Features That Must Be Preserved

#### Patient Records

- Add, edit, search, and view patient records
- Auto-generated patient code
- Patient code format: `P-YYYY-0001`
- Patient sequence resets each year
- Search by patient name, patient code, or mobile number
- Patient classification:
  - None
  - Senior Citizen
  - PWD
  - Senior Citizen and PWD
  - Other
- Type of Disability is shown only for PWD-related classifications
- Branch field
- Medical Alert Summary

#### Treatment Records

- Add and view treatment records
- Auto-generated treatment code
- Treatment code format: `T-YYYY-0001`
- Treatment sequence resets each year
- Treatment date defaults to today
- Treatment date remains editable
- Future treatment dates are not allowed
- Procedure choose-or-type field
- Dentist choose-or-type field
- Tooth number or numbers
- Remarks
- Treatment history per patient

#### Payments and Discounts

- Amount Charged
- Discount Type
- Discount Percent
- Discount Amount
- Net Amount Due
- Amount Paid
- Balance
- Senior Citizen and PWD discounts must not be doubled
- A patient classified as both Senior Citizen and PWD uses one 20% discount basis unless the clinic formally approves another rule

#### Appointments

- Schedule appointments from a patient record
- View appointments per patient
- Edit appointments
- Current statuses:
  - Scheduled
  - Completed
  - Cancelled
  - No-show
- Only scheduled appointments currently appear in dashboard schedules
- Completed, cancelled, and no-show appointments remain in the patient history
- Planned procedure supports choose-or-type behavior
- Blank planned procedure displays as `General Appointment`
- Appointment time is optional
- Blank appointment time displays as `No final time`

#### Treatment Follow-Ups

- Treatment entry supports Next Appointment Date
- Treatment entry supports Next Appointment Time
- Next Appointment Time is optional
- If a time is entered, a date is required
- Follow-up appointments appear in dashboard schedules

#### Dashboard

- Clinic overview
- Quick totals
- Birthday reminder card
- Recent patients
- Today's clinic schedule
- Check schedule by date
- Schedule tables use internal scrolling where appropriate
- Patient code is intentionally omitted from dashboard schedule rows when it does not help daily workflow

#### Birthday Reminders

- Uses the patient birthday field
- Shows Birthday Today or Upcoming Birthday
- Birthday is treated as a plain date rather than a timezone timestamp
- Avoid duplicate birthday sections

#### Attachments

- Patient-level attachments
- Treatment-level attachments
- Attachment category is required
- Allowed formats currently include:
  - JPG
  - JPEG
  - PNG
  - WEBP
  - PDF
  - DOC
  - DOCX
  - TXT
- Unsafe executable, archive, and script formats are blocked
- Current maximum attachment size: 20 MB per file
- Download attachments
- Delete attachments
- Preview image attachments
- Print/PDF output displays clean image previews and category labels
- Print/PDF output hides unnecessary attachment metadata

#### Documents and Export

- Patient record print page
- Treatment record print page
- Patient treatment history print/PDF
- Letter-size layouts
- Buttons excluded from print output
- Excel export for patient and treatment information
- Follow-up appointment date/time included where applicable

#### Backup

- Backup database and uploaded files together
- Current backup includes:
  - `data/`
  - `uploads/`
  - `exports/` when present
- Restoring only the database can leave attachment records without their files

---

## 3. V2 Goals

The next version must:

1. Be safely accessible online.
2. Use PostgreSQL instead of SQLite.
3. Use private object storage instead of local upload folders.
4. Support patient, personnel, dentist, clinic-administrator, and system-administrator accounts.
5. Enforce permissions in the backend.
6. Provide an append-only audit trail.
7. Provide a patient portal.
8. Provide appointment request, confirmation, cancellation, and rescheduling workflows.
9. Provide outstanding balance and collectible tracking.
10. Provide invoices, payments, expenses, receivables, payables, and daily financial summaries.
11. Work well on phones, tablets, laptops, and desktops.
12. Support direct camera capture on compatible mobile/laptop devices.
13. Use secure deployment, backups, monitoring, and recovery procedures.
14. Preserve the current clinic-specific record and discount rules unless a new approved requirement changes them.

---

## 4. Recommended Technology Stack

### 4.1 Frontend

- React
- Vite
- Tailwind CSS
- React Router
- TanStack Query for server state and caching
- React Hook Form for forms
- Zod for shared validation schemas
- A date library such as `date-fns`
- Accessible UI primitives where useful

### 4.2 Backend

- Node.js LTS
- Express
- TypeScript is required for new V2 backend, shared code, and newly created frontend modules unless an approved exception is documented
- Zod request validation
- PostgreSQL driver: `pg`
- A migration system such as `node-pg-migrate`, `Knex`, or another approved migration tool
- Structured application logging
- Centralized authorization middleware
- Centralized audit event service

Use an Active LTS or Maintenance LTS release of Node.js for production. As of August 2026, Node.js 24 is an LTS line. Pin the selected major version in the repository using `.nvmrc`, `.node-version`, and `package.json` engines.

Example:

```json
{
  "engines": {
    "node": ">=24 <25"
  }
}
```

### 4.3 TypeScript Migration Strategy

The current application is primarily JavaScript and JSX. V2 will migrate the
active codebase incrementally to TypeScript and TSX before major new cloud
modules are built.

The migration exists to improve correctness, refactoring safety, editor
tooling, API-contract clarity, and Codex's ability to detect invalid data
shapes, missing properties, incorrect function arguments, nullable values, and
frontend/backend contract mismatches.

#### 4.3.1 Migration Principles

- Do not rewrite the entire application in one task.
- Preserve all behavior protected by the V1 regression-test safety net.
- Keep JavaScript and TypeScript interoperable during the transition.
- Avoid mixing large TypeScript-only conversions with unrelated business-rule
  changes.
- New V2 source files should use TypeScript by default.
- Use `.ts` for backend, utilities, schemas, domain types, repositories,
  services, scripts, and shared non-React code.
- Use `.tsx` for React components, pages, layouts, and other files containing
  JSX.
- Prefer explicit domain types for patients, treatments, appointments,
  attachments, users, roles, permissions, audit events, invoices, payments,
  expenses, branches, and notifications.
- Model optional and nullable values deliberately instead of relying on
  implicit JavaScript behavior.
- Do not use `any` as a routine escape hatch. Temporary `any` usage must be
  narrow, documented, and removed when the surrounding module is migrated.
- Do not use TypeScript assertions to bypass runtime validation for data
  received from HTTP requests, environment variables, databases, storage, or
  other external systems.
- Continue using Zod or another approved runtime validator at trust
  boundaries. TypeScript compile-time types do not replace runtime validation.
- Run type checking together with regression tests and the production build
  before merging each migration batch.

#### 4.3.2 Recommended Migration Order

1. Finish and commit the V1 regression-test safety net.
2. Add TypeScript compiler configuration and project scripts.
3. Reuse stable shared TypeScript helpers and migrate only low-risk modules
   that clearly support the next approved V2 step.
4. Classify legacy areas as keep, adapt, replace, bridge, or retire-later
   instead of treating broad JavaScript elimination as the primary goal.
5. Preserve compatibility bridges while live runtime consumers still depend on
   them.
6. Establish PostgreSQL and other V2 foundations without waiting for 100%
   TypeScript conversion of the current V1 application.
7. Replace capabilities in incremental vertical slices that preserve approved
   clinic behavior while moving toward the target architecture.
8. Retire legacy JavaScript and compatibility layers only after parity,
   runtime, data-migration, and review gates are satisfied.
9. Convert additional source to TypeScript where it materially improves a
   replacement slice or a stable shared foundation.
10. Remove obsolete JavaScript compatibility settings only after all required
    consumers are migrated and tests remain green.
11. Increase compiler strictness gradually until the approved strict target is
    reached.

#### 4.3.3 TypeScript Configuration Requirements

The exact configuration may evolve during migration, but the project should
provide repository-level type-check commands and separate frontend/backend
TypeScript configuration where useful.

Recommended expectations:

```text
tsconfig.json
client/tsconfig.json
server/tsconfig.json
```

During the transition, compatibility options such as `allowJs` may be used when
needed so JavaScript and TypeScript can coexist. They should be removed when the
migration is complete.

The final V2 configuration should enable strict type checking where practical,
including checks for nullability, unsafe property access, and inconsistent API
contracts.

Required root command:

```bash
npm run typecheck
```

The command should type-check the relevant workspaces without emitting
production files.

#### 4.3.4 Shared Types and Runtime Validation

TypeScript types should describe trusted application contracts. Zod schemas or
another approved runtime-validation mechanism must validate untrusted input.

Examples of shared contracts include:

```text
Patient
Treatment
Appointment
Attachment
User
Role
Permission
Invoice
Payment
Expense
AuditEvent
ApiError
PaginatedResponse<T>
```

Rules:

- Do not duplicate incompatible request/response shapes across frontend and
  backend.
- Reuse shared types only where doing so does not couple the browser to
  server-only secrets or privileged implementation details.
- Database row types, API response types, form types, and patient-visible types
  may intentionally differ.
- Patient-portal response types must exclude staff-only and internal clinical
  fields by design.
- Financial types must not imply that JavaScript floating-point arithmetic is
  authoritative for money.

#### 4.3.5 Migration Safety Gate

A TypeScript conversion batch is complete only when:

- Existing regression tests still pass.
- New or changed behavior has appropriate tests.
- `npm run typecheck` passes.
- The relevant build passes.
- No real patient data was used.
- The batch does not silently change approved clinic behavior.
- New type errors are resolved rather than broadly suppressed.
- The final diff remains focused enough to review.

TypeScript migration must strengthen the V2 transition rather than become a
second uncontrolled rewrite.

### 4.4 Database

- PostgreSQL
- UUID primary keys
- Human-readable patient and treatment codes stored separately
- Database migrations committed to Git
- Transactions for multi-step clinical and financial operations
- Constraints for data integrity
- Row Level Security when tables are exposed through Supabase APIs

### 4.5 Authentication and Cloud Services

Recommended managed services:

- Supabase PostgreSQL
- Supabase Auth
- Supabase private Storage
- Render for the Express API
- Render Static Site for the React frontend as the default low-cost option
- Vercel as an optional frontend host when its production plan is justified
- A transactional email provider for account and important appointment emails
- No SMS provider in the initial V2 scope

The Express API remains the primary trusted business-logic layer. The frontend must never receive database passwords, service-role keys, unrestricted storage credentials, or other server secrets.

### 4.6 Testing

- Vitest
- React Testing Library
- Supertest
- Playwright
- Database integration tests against a separate test database
- Automated build, lint, and test checks in CI

---

## 5. Target Architecture

```text
Desktop / Tablet / Smartphone
            |
         HTTPS
            |
     React + Vite Web App
            |
Authenticated API requests
            |
     Node.js + Express API
       /        |        \
      /         |         \
PostgreSQL   Private      In-app and email
Database     Object       notifications
             Storage
```

### 5.1 Architecture Rules

- All clinic data must be transferred over HTTPS.
- Sensitive business rules must run in the backend.
- The backend must verify authentication and authorization on every protected request.
- React route protection and hidden buttons are convenience features, not security controls.
- Uploaded documents must not be stored in a public web directory.
- Financial totals must be calculated by the backend and database, not trusted from the browser.
- The frontend must not directly use the Supabase service-role key.
- The database must not be reachable from arbitrary clients using privileged credentials.
- Production and staging must use separate databases, storage buckets, keys, and environments.

---

## 6. Roles and Permissions

Create five primary roles:

1. Patient
2. Personnel
3. Dentist
4. Clinic Administrator / Clinic Owner
5. System Administrator / Developer

Roles represent responsibilities rather than separate people. A single user may
be assigned more than one role when the clinic explicitly approves the
assignment.

The `Dentist` role controls clinical responsibilities. The `Clinic
Administrator` role controls clinic ownership, approvals, business oversight,
audit review, and disaster-recovery authorization. The `System Administrator`
role is a technical service role for the developer or authorized IT provider.

The System Administrator is not the clinic owner and must not receive routine
access to patient, clinical, attachment, or financial data.

### 6.1 Owner-Dentist Role Assignment

The current dentist is also the owner of the clinic.

The dentist-owner must use one account assigned both of the following roles:

- `Dentist`
- `Clinic Administrator`

This does not create duplicate accounts. The account receives the combined
permissions of both roles.

The `Dentist` role provides clinical permissions, including complete clinical
record access, treatment creation, internal dentist notes, treatment
finalization, clinical corrections, and publication of patient-visible
information.

The `Clinic Administrator` role provides clinic-level authority, including
staff-account approval, operational-role approval, financial oversight,
complete clinic audit review, business settings, data-export approval, backup
status review, and backup-restore approval.

The interface may display the combined title `Clinic Owner / Dentist`, but the
backend must keep both roles separate.

Future associate dentists must receive only the `Dentist` role unless the
clinic explicitly grants them administrative authority.

The developer uses only the `System Administrator` role. The System
Administrator must never grant the `Dentist` or `Clinic Administrator` role to
their own account.

### 6.2 Permission Matrix

| Capability | Patient | Personnel | Dentist | Clinic Administrator | System Administrator |
|---|---:|---:|---:|---:|---:|
| View own patient-visible records | Yes | N/A | N/A | N/A | No |
| View clinic patient list | No | Yes | Yes | Controlled | No by default |
| View complete clinical records | No | Yes, read-only | Yes | No by role alone | No |
| View medical alerts | Own patient-visible information | Yes | Yes | No by role alone | No |
| View treatment history | Own patient-visible history | Yes, read-only | Yes | No by role alone | No |
| View internal dentist notes | No | No by default | Yes | No by role alone | No |
| Edit permitted patient demographics | Limited own fields | Yes | Limited | No by role alone | No |
| Create patient records | No | Yes | Yes | No by role alone | No |
| Create or encode treatment drafts | No | No by default | Yes | No by role alone | No |
| Finalize treatment records | No | No | Yes | No by role alone | No |
| Correct finalized treatment records | No | No | Yes, controlled | No by role alone | No |
| Publish records to the patient portal | No | No | Yes | No by role alone | No |
| Request appointments | Own only | Yes | Yes | No by role alone | No |
| Confirm or reschedule appointments | No | Yes | Yes | No by role alone | No |
| Cancel appointments | Own, based on policy | Yes | Yes | No by role alone | No |
| Record payments | No | Yes | Optional | No by role alone | No |
| Create expenses | No | Yes | Optional | No by role alone | No |
| Approve expenses | No | Controlled | Optional | Yes | No |
| View own balance | Yes | N/A | N/A | N/A | No |
| View clinic receivables | No | Yes | Controlled | Yes | No |
| View complete financial reports | No | Operational access | Controlled | Yes | No |
| Export patient records | Own patient-visible records only | Controlled | Controlled | Approve or perform, based on policy | No by default |
| Approve staff-account creation or deactivation | No | No | No | Yes | No |
| Provision, recover, or technically deactivate accounts | No | No | No | No | Yes, after clinic approval |
| Approve operational role assignments | No | No | No | Yes | No |
| Configure role definitions and permission mappings | No | No | No | Approve material changes | Yes |
| Assign a privileged role to own account | No | No | No | No | No |
| View complete clinic audit trail | No | No | Limited clinical activity | Yes | No |
| View technical and security logs | No | No | No | Controlled | Yes |
| Change clinic business settings | No | No | Controlled | Yes | No |
| Change deployment and technical settings | No | No | No | Approve material changes | Yes |
| View backup status | No | No | No | Yes | Yes |
| Request an on-demand backup | No | No | No | Yes | Yes |
| Configure backup automation | No | No | No | No | Yes |
| Approve a production backup restore | No | No | No | Yes | No |
| Execute an approved backup restore | No | No | No | No | Yes, with MFA and reauthentication |
| Deploy application updates | No | No | No | No | Yes |
| Run database migrations | No | No | No | No | Yes |
| Access another user's account by impersonation | No | No | No | No | No |

Because the current doctor has both `Dentist` and `Clinic Administrator`, their
single account receives the union of those two columns. For example, the doctor
can finalize treatment records through the Dentist role and approve a backup
restore through the Clinic Administrator role.

The phrase **patient-visible** applies only to information shown in the patient
portal. It does not prevent authorized personnel and dentists from accessing
records required for their assigned duties.

### 6.3 Authorization Requirements

- Every API route must define required permissions.
- Permission checks must happen after authentication and before data access.
- Permissions are granted through roles and explicit policies, not through job
  titles displayed in the interface.
- When a user has multiple roles, the backend may combine their permitted
  actions, but explicit denials and sensitive-operation safeguards still apply.
- A user must only access records belonging to allowed branches.
- A patient must only access the patient record explicitly linked to the
  account.
- Use deny-by-default behavior.
- Record sensitive authorization failures in the audit/security log.
- Test direct-object-reference attacks by changing URL and request IDs.
- Role changes take effect immediately and invalidate existing privileged
  sessions when necessary.
- The System Administrator must not approve their own privileged access,
  assign operational roles to themselves, or bypass clinic approval.
- Backup restore requires dual control: Clinic Administrator approval and
  System Administrator execution.
- Account impersonation is prohibited.

### 6.4 System Administrator Restrictions and Temporary Support Access

The System Administrator is a technical maintenance role and is not a clinical
or business role.

Default System Administrator access is limited to:

- Deployment and environment configuration
- Application health and monitoring
- Database migrations
- Backup automation and restore execution
- Technical account provisioning and recovery after clinic approval
- Role and permission configuration after clinic approval
- Technical and security logs that do not expose unnecessary patient content
- Error investigation using redacted or fictional data whenever possible

The System Administrator must not have permanent access to patient records,
treatments, internal dentist notes, attachments, payments, expenses, or
complete financial reports.

When real production data is required to investigate a support incident,
temporary support access must:

1. Be requested for a documented support ticket.
2. Be approved by the Clinic Administrator.
3. Define the exact permitted module, record, or action.
4. Start and expire automatically.
5. Require System Administrator MFA and reauthentication.
6. Record every view, download, and change in the append-only audit trail.
7. Be revocable immediately by the Clinic Administrator.

Suggested `support_access_requests` fields:

```text
id
requested_by
approved_by
assigned_to
support_ticket
reason
permitted_scope
starts_at
expires_at
revoked_at
status
created_at
```

The clinic must retain access to its own data, administrative account, backup
status, recovery documentation, and export process even when the developer is
unavailable or the maintenance agreement ends.

## 7. Authentication and Account Workflows

### 7.1 Staff Account Workflow

1. The Clinic Administrator approves creation of the staff account.
2. The System Administrator or an approved automated service sends the
   invitation.
3. The staff member verifies the email address and creates a password.
4. The Clinic Administrator approves the operational role and branch.
5. The System Administrator may complete technical provisioning, account
   recovery, or deactivation after clinic approval.
6. The System Administrator must not select, expand, or grant operational
   access without Clinic Administrator approval.
7. Invitation, approval, activation, provisioning, role assignment, recovery,
   and deactivation are written to the audit trail.

Staff accounts must not use unrestricted public self-registration.

A new environment may use the one-time server-side `npm run bootstrap:owner`
command to create the first owner as one pending application user with exactly
`Dentist` and `Clinic Administrator` roles. The bootstrap must refuse to run
once any Clinic Administrator role assignment exists, must not expose a public
HTTP bootstrap route, and must still require the owner to accept the managed
authentication invitation and choose their own password before activation.

### 7.2 Patient Account Workflow

1. Personnel creates or verifies the clinic patient record.
2. Personnel records and verifies the patient's email address.
3. The system sends an email invitation or secure verification link.
4. The patient verifies the email address and creates an account.
5. The account is linked to exactly one internal patient record unless a guardian/dependent feature is intentionally implemented.
6. Activation is recorded in the audit trail.

Do not allow a user to claim a patient record using only a patient code and birthday. A mobile number may remain in the patient record as contact information, but it must not be required for authentication, account activation, password recovery, or normal portal operation. Patients without a verified email may still be managed by clinic personnel, but they cannot activate a self-service portal account until a verified email is provided.

### 7.3 Authentication Controls

- Use managed authentication when possible.
- Never store plaintext passwords.
- Require strong password rules without unreasonable complexity requirements.
- Use secure password reset flows.
- Rate-limit login, registration, invitation, and reset endpoints.
- Detect and audit failed login attempts.
- Require verified email before patient or staff account activation.
- Require multi-factor authentication for both `Clinic Administrator` and
  `System Administrator` accounts.
- Require MFA for any user who can approve or execute role changes, export all
  records, approve or execute backup restores, deploy updates, run migrations,
  or change security settings.
- Invalidate sessions after password changes, role changes, account
  deactivation, or suspected compromise.
- Use inactivity timeouts for staff and privileged sessions.
- Require reauthentication before destructive or highly sensitive actions.
- Do not reveal whether an email address exists during password recovery.
- Never allow the System Administrator to reset a Clinic Administrator account
  and then use that account.
- Emergency account recovery must require documented clinic authorization and
  must be audited.

### 7.4 Notification Scope Decision

The initial V2 release supports **in-app notifications and transactional email only**.

Required notification channels:

- **In-app notifications** for appointment requests, confirmations, rescheduling, cancellations, account activity, and other relevant system events.
- **Email notifications** for staff and patient invitations, email verification, password recovery, security notices, and important appointment status changes.

SMS verification, SMS appointment reminders, and SMS status updates are excluded from the initial implementation because they introduce recurring per-message costs, provider dependencies, delivery-failure handling, consent requirements, abuse controls, and additional operational complexity.

Implementation rules:

- The system must not require SMS for account registration, authentication, MFA, appointment booking, password recovery, or normal clinic operation.
- Mobile numbers may still be recorded as patient contact information and displayed to authorized clinic personnel.
- Email messages must avoid unnecessary clinical or financial details. Where possible, the email should direct the user to sign in to the secure portal.
- A failed notification email must be recorded and retryable, but it must not silently reverse a successfully completed appointment or account operation.
- The application should retain in-app notification history and read/unread status.
- Do not create SMS provider integrations, SMS templates, SMS delivery logs, or SMS-related environment variables in the initial V2 implementation.
- SMS may only be reconsidered later through a separately approved requirement and budget review.

---

## 8. Patient Portal

Patients must be able to:

- Sign in securely
- View their profile
- View patient-visible treatment history
- View upcoming and previous appointments
- Request an appointment
- Request cancellation or rescheduling
- View current balance
- View payment history
- Download patient-visible documents
- Update permitted contact information
- Change password
- View privacy information
- Sign out from all devices

Patients must not automatically see:

- Internal dentist notes
- Staff-only remarks
- Audit logs
- Other patient records
- Draft or non-patient-visible treatment records
- Staff account information
- Internal financial notes
- System configuration

### 8.1 Record Publication

Add an explicit field or workflow for content that may appear in the patient portal.

Examples:

- `patient_visible`
- `published_at`
- `published_by`

A treatment record may be complete internally but remain hidden from the patient until the dentist publishes the patient-visible portion.

---

## 9. Audit Trail

The audit trail is an append-only history of sensitive activity. It is different from ordinary debugging logs.

**Append-only** means the application may create new audit events, but it may
not edit or delete events that already exist. When an incorrect payment,
clinical entry, appointment status, role assignment, or other sensitive action
needs correction, the system must add a new reversal or correction event while
preserving the original event. The Clinic Administrator may view and export the complete clinic audit
trail, but this access does not include rewriting history. The System
Administrator may view technical and security events needed for maintenance,
but must not receive routine access to clinical audit details.

At the database level, the normal application role should be allowed to
`INSERT` authorized audit events and `SELECT` events permitted by policy, but
should not receive routine `UPDATE` or `DELETE` permission on `audit_events`.
Any exceptional retention or legal-maintenance procedure must occur through a
separately controlled administrative process outside ordinary application use.

### 9.1 Suggested `audit_events` Fields

```text
id
occurred_at_utc
actor_user_id
actor_role
branch_id
action
entity_type
entity_id
before_data
after_data
ip_address
user_agent
request_id
reason
result
metadata
```

Recommended PostgreSQL types:

- `id`: UUID
- `occurred_at_utc`: `TIMESTAMPTZ`
- `before_data`: `JSONB`
- `after_data`: `JSONB`
- `metadata`: `JSONB`

### 9.2 Required Audit Actions

```text
LOGIN_SUCCEEDED
LOGIN_FAILED
LOGOUT
PASSWORD_CHANGED
PASSWORD_RESET_REQUESTED
MFA_ENABLED
MFA_DISABLED
USER_INVITED
USER_ACTIVATED
USER_DEACTIVATED
USER_ROLE_CHANGED
PATIENT_VIEWED
PATIENT_CREATED
PATIENT_UPDATED
PATIENT_ARCHIVED
TREATMENT_VIEWED
TREATMENT_CREATED
TREATMENT_UPDATED
TREATMENT_CORRECTED
APPOINTMENT_REQUESTED
APPOINTMENT_CONFIRMED
APPOINTMENT_RESCHEDULED
APPOINTMENT_CANCELLED
PAYMENT_RECORDED
PAYMENT_REVERSED
REFUND_RECORDED
EXPENSE_CREATED
EXPENSE_UPDATED
EXPENSE_APPROVED
ATTACHMENT_UPLOADED
ATTACHMENT_VIEWED
ATTACHMENT_DOWNLOADED
ATTACHMENT_DELETED
RECORD_EXPORTED
REPORT_EXPORTED
BACKUP_CREATED
BACKUP_RESTORED
SYSTEM_SETTING_CHANGED
AUDIT_LOG_VIEWED
AUDIT_LOG_EXPORTED
```

### 9.3 Audit Rules

- Audit events cannot be edited from the application.
- Ordinary users cannot delete audit entries.
- Viewing or exporting audit events is itself audited.
- Never store passwords, access tokens, authentication codes, or full file contents in audit entries.
- Avoid copying unnecessary health information into audit metadata.
- Record both successful and failed sensitive operations.
- Require a reason for reversals, corrections, overrides, cancellations, and permission changes.
- Use UTC timestamps.
- Include request identifiers to connect application logs with audit events.
- Add PostgreSQL triggers for critical clinical and financial tables as defense in depth.
- Clinic Administrator activity and System Administrator activity must both be audited.
- Temporary support-access approval, activation, use, expiration, and revocation must be audited.
- System Administrator technical logs must avoid unnecessary patient and financial content.

---

## 10. Appointment Module

### 10.1 Appointment Statuses

Use the following statuses:

```text
Requested
Pending Confirmation
Confirmed
Checked In
In Progress
Completed
Cancelled by Patient
Cancelled by Clinic
No-show
Rescheduled
```

Store statuses as stable machine values and display friendly labels in the interface.

Example machine values:

```text
requested
pending_confirmation
confirmed
checked_in
in_progress
completed
cancelled_by_patient
cancelled_by_clinic
no_show
rescheduled
```

### 10.2 Patient Booking Workflow

1. Patient selects branch.
2. Patient selects preferred dentist when allowed.
3. Patient selects service or planned procedure.
4. Patient selects preferred date and time.
5. System validates that the request is not in the past.
6. System checks availability.
7. Appointment is created as `requested` or `pending_confirmation`.
8. Personnel confirms the slot or proposes another time.
9. Patient receives an in-app notification and an email for important appointment status changes.
10. Every change is recorded in appointment history and the audit trail.

### 10.3 Cancellation and Rescheduling

Cancellation must not delete an appointment.

Store:

- Who cancelled
- Cancellation date and time
- Cancellation reason
- Previous date and time
- New date and time when rescheduled
- Whether the appointment was cancelled by the patient or clinic
- Related replacement appointment ID when applicable

The clinic must define a cancellation cutoff policy. The interface should display the policy clearly.

### 10.4 Prevent Double Booking

Availability checks must be enforced in the database transaction, not only in React.

Use a combination of:

- Dentist
- Appointment date
- Start time
- End time or duration
- Active appointment status
- Branch membership validation for the selected appointment location

The same Dentist must not be double-booked across different branches at overlapping times. Branch is the appointment location and an authorization/membership constraint; it must not allow a Dentist to occupy overlapping slots simply because the branch differs.

The backend must handle concurrent requests safely inside PostgreSQL transactions. When two users attempt to reserve overlapping active slots for the same Dentist, only one may succeed and the other must receive a clear conflict response.

### 10.5 Full Calendar Requirements

- Day view
- Week view
- Dentist filter
- Branch filter
- Status filter
- Pending request panel
- Clear status colors with text labels
- Mobile agenda view
- Appointment details drawer or modal
- Rescheduling workflow
- Waiting-list support as a later enhancement

**Implementation sequencing:** Task Phase 12 builds the protected clinic appointment engine and calendar. Task Phase 13 adds in-app/email notifications to appointment transitions. Task Phase 14 adds patient OWN-scoped self-service request/cancellation/reschedule workflows. Phase 12 may support the underlying `requested` and `pending_confirmation` states, but it must not pull the Patient Portal or notification delivery subsystems forward.

---

## 11. Attachment and Mobile Camera Module

### 11.1 User Experience

Display two separate options:

- Take Photo
- Choose Existing File

Simple mobile capture input:

```html
<input
  type="file"
  accept="image/*"
  capture="environment"
/>
```

The `capture="environment"` value requests the outward-facing camera on compatible devices. Browser support is not universal, so the application must gracefully fall back to the standard file picker.

For a custom camera interface, use:

```javascript
navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: { ideal: "environment" }
  },
  audio: false
});
```

`getUserMedia()` requires HTTPS in production.

### 11.2 Capture Workflow

1. User taps Take Photo.
2. Device opens the rear camera when supported.
3. User captures the document or image.
4. Application shows a preview.
5. User may retake, rotate, or crop.
6. User selects attachment category.
7. User may enter a description.
8. Application compresses large images while preserving readable quality.
9. Backend validates the file.
10. File is uploaded to private object storage.
11. Database stores only the object key and metadata.
12. Upload is recorded in the audit trail.

### 11.3 Required Attachment Metadata

```text
id
patient_id
treatment_id
category
original_filename
object_key
mime_type
size_bytes
checksum
uploaded_by
uploaded_at
is_patient_visible
description
status
```

An attachment belongs to a patient, a treatment, or another approved entity. Enforce valid ownership using constraints.

### 11.4 File Security

- Use an allowlist of permitted extensions.
- Check MIME type.
- Check actual file signature or magic bytes.
- Do not trust the browser-provided MIME type alone.
- Generate random server-side object names.
- Store the original name as metadata only.
- Enforce file-size limits.
- Enforce per-user and per-patient upload limits where needed.
- Use private storage buckets.
- Generate short-lived signed URLs for downloads.
- Remove unnecessary EXIF metadata, especially GPS location.
- Consider malware scanning before production.
- Prevent uploaded HTML, scripts, executables, and unsafe archives.
- Set safe download headers.
- Log uploads, previews, downloads, replacements, and deletions.
- Do not expose an unrestricted `/uploads/...` public route.
- Do not store production uploads on Render's local filesystem.

### 11.5 Allowed File Types

The current allowed list may be preserved initially:

```text
jpg
jpeg
png
webp
pdf
doc
docx
txt
```

Before production, review whether DOC, DOCX, and TXT are truly required. A smaller allowlist reduces risk.

---

## 12. Financial Module

The financial module must separate billing, collections, receivables, expenses, refunds, and cash closing.

### 12.1 Important Definitions

- **Revenue billed:** Value of services charged to patients.
- **Cash collected:** Money actually received during the selected period.
- **Accounts receivable:** Patient balances still unpaid.
- **Accounts payable:** Approved clinic obligations not yet paid.
- **Expense:** Money spent or owed for clinic operations.
- **Discount:** Reduction from the normal charge.
- **Refund:** Money returned to a patient.
- **Net cash movement:** Collections minus cash expenses and refunds.

Do not label all of these values as daily income.

### 12.2 Outstanding Balances / Collectibles

The dashboard must contain a compact actionable Outstanding Balances or Collectibles card.

Suggested columns:

| Patient | Last Treatment | Total Balance | Due Date | Days Overdue | Contact | Action |
|---|---|---:|---|---:|---|---|

The full Collectibles page must support:

- Search by patient
- Branch filter
- Balance range filter
- Due-date filter
- Current versus overdue filter
- Aging buckets
- Last payment date
- Last collection follow-up
- Payment-plan status
- Printable statement of account
- Export controlled by permission

Aging buckets:

```text
Current
1-30 days overdue
31-60 days overdue
61-90 days overdue
More than 90 days overdue
```

### 12.3 Required Financial Entities

```text
invoices
invoice_items
payments
payment_allocations
discounts
adjustments
refunds
expenses
expense_categories
suppliers
accounts_payable
daily_closings
```

Do not treat treatment records as the complete accounting ledger.

### 12.4 Invoice Requirements

An invoice should contain:

```text
id
invoice_number
patient_id
branch_id
invoice_date
due_date
status
subtotal
discount_total
adjustment_total
total_amount
amount_paid
balance_due
created_by
created_at
finalized_at
voided_at
void_reason
```

Invoice item fields:

```text
id
invoice_id
treatment_id
procedure_code
procedure_name
description
quantity
unit_price
discount_amount
line_total
```

### 12.5 Payment Requirements

Payment fields:

```text
id
receipt_number
patient_id
branch_id
payment_date
amount
payment_method
reference_number
notes
received_by
status
created_at
reversed_at
reversal_reason
```

Suggested payment methods:

```text
Cash
GCash
Bank Transfer
Credit Card
Debit Card
Cheque
Other
```

Payment allocation connects a payment to one or more invoices.

### 12.6 Payment Integrity

After a payment is officially recorded:

- Do not overwrite it directly.
- Use reversal, refund, or adjustment transactions.
- Record who corrected it and why.
- Preserve the original transaction.
- Generate a unique receipt number.
- Update invoice balances transactionally.
- Add an audit event.
- Prevent negative or impossible allocations.
- Prevent total allocation from exceeding payment amount.

### 12.7 Expense Entry

Personnel must be able to record clinic expenses such as toilet paper, cleaning supplies, office materials, dental supplies, repairs, and utilities.

Expense fields:

```text
id
expense_number
expense_date
branch_id
category_id
description
supplier_id
amount
payment_method
reference_number
receipt_attachment_id
entered_by
approved_by
approval_status
notes
created_at
updated_at
```

Suggested categories:

```text
Dental Supplies
Cleaning Supplies
Office Supplies
Utilities
Rent
Laboratory Fees
Equipment
Maintenance
Transportation
Staff Expense
Miscellaneous
```

Use the term **Expense** for normal purchases. Tax deductibility must be defined by the clinic's accountant and may later be represented by a separate accounting classification.

### 12.8 Accounts Payable

Accounts payable should support:

- Supplier
- Bill number
- Bill date
- Due date
- Original amount
- Amount paid
- Outstanding amount
- Status
- Payment history
- Supporting attachment
- Approval status

### 12.9 Daily Financial Summary

The dashboard or finance page should show:

```text
Services Billed Today
Cash Collected Today
Digital or Bank Collections
New Accounts Receivable
Outstanding Accounts Receivable
Expenses Paid Today
New Accounts Payable
Refunds Today
Net Cash Movement
Expected Cash on Hand
Actual Cash Count
Cash Difference
```

### 12.10 Daily Closing

At the end of a shift or day:

1. System calculates expected cash.
2. Authorized staff enters actual cash count.
3. System calculates difference.
4. Staff enters an explanation when there is a difference.
5. Closing is submitted.
6. Clinic Administrator reviews or approves when required.
7. Submitted closing is locked from ordinary editing.
8. Corrections use an adjustment or reopening workflow.
9. All events are audited.

### 12.11 Accounting Scope

The first production release should provide a reliable clinic cashbook, invoices, collections, receivables, expenses, payables, and daily closing.

A complete formal double-entry accounting system should only be implemented after the clinic's accountant defines:

- Chart of accounts
- Debit and credit posting rules
- Tax classifications
- Reporting periods
- Closing rules
- Required statutory reports

---

## 13. Database Design

### 13.1 Core Tables

```text
users
roles
permissions
user_roles
staff_profiles
dentist_profiles
patient_accounts
patients
branches
appointments
appointment_history
treatments
treatment_notes
attachments
```

### 13.2 Financial Tables

```text
invoices
invoice_items
payments
payment_allocations
discounts
adjustments
refunds
expenses
expense_categories
suppliers
accounts_payable
daily_closings
```

### 13.3 System Tables

```text
audit_events
notifications
notification_preferences
email_delivery_logs
login_sessions
system_settings
backup_records
support_access_requests
yearly_counters
```

### 13.4 Identifier Rules

Use UUID primary keys internally.

Example:

```text
patients.id = UUID
patients.patient_code = P-2026-0001
```

Keep patient and treatment codes for display and search, but do not use them as the only relationship key.

Benefits:

- Safer imports
- Multi-branch compatibility
- Better concurrency
- Easier code changes
- Avoids exposing sequential primary keys

### 13.5 Annual Code Generation

Do not use `MAX(number) + 1`.

Use a transaction with a locked yearly counter or another safe PostgreSQL sequence strategy.

Suggested `yearly_counters` fields:

```text
counter_type
year
last_value
updated_at
```

Generate the next code in one database transaction.

### 13.6 Money

Use PostgreSQL decimal types such as:

```sql
NUMERIC(12, 2)
```

Rules:

- Do not use JavaScript floating-point values as the final authority for money.
- Validate non-negative amounts where required.
- Calculate invoice and payment totals on the server.
- Use database constraints.
- Use one consistent currency, initially PHP.
- Store currency code if future multi-currency support is possible.

### 13.7 Dates and Time

- Use `DATE` for birthdays and date-only clinical values.
- Use `TIMESTAMPTZ` for workflow/event timestamps such as logins, uploads, appointment history/actions, and audit times. Keep the clinic appointment schedule itself as `DATE` + local wall-clock `TIME` (with duration) so Asia/Manila scheduling is not accidentally shifted by timezone conversion.
- Store event timestamps in UTC.
- Display timestamps using the clinic's configured timezone.
- Default clinic timezone: `Asia/Manila` unless configured otherwise.
- Never accidentally shift birthdays due to timezone conversion.

### 13.8 Branches

The current product represents one clinic organization that may operate one or multiple branches. Do not add a separate clinic/tenant table unless a later approved requirement introduces true multi-clinic tenancy.

Create a real `branches` table instead of relying on free-text branch names. Branches use a UUID relationship key plus a unique short code and human-readable name. New branches must be addable as new branch records without redesigning patient, user, or transaction identity.

Dentist and Personnel users may be associated with one or multiple branches through the many-to-many `user_branches` relationship. This represents allowed/associated work locations, not a permanent home-branch lock. Actual schedules may place staff together or separately and remain a later scheduling concern.

Clinic Administrator administrative/business authority is clinic-wide and should use GLOBAL permissions where appropriate. The Clinic Administrator role alone does not imply clinical access; the owner-dentist receives clinical access through the separate Dentist role.

Patients belong to the clinic as a whole and must not be duplicated simply because they visit another branch. The current `patients.branch_id` field is retained as registration/origin branch context and must not be interpreted as exclusive patient ownership.

Branch-specific transactions record where the activity actually occurred. Add or preserve `branch_id` on:

- Appointments
- Treatments
- Invoices
- Payments
- Expenses
- Daily closings
- Audit events where applicable

Future authenticated operational writes must use the actual transaction/service branch rather than automatically inheriting the patient's registration branch.

Suggested branch fields:

```text
id
code
name
address
phone
timezone
is_active
created_at
```

### 13.9 Soft Deletion and Corrections

Clinical and financial records should usually be archived, voided, reversed, or corrected instead of physically deleted.

Use fields such as:

```text
status
archived_at
archived_by
voided_at
voided_by
void_reason
superseded_by_id
```

Physical deletion should be limited to carefully defined administrative cleanup cases.

### 13.10 Row Level Security

When Supabase Data APIs or client libraries can access tables:

- Enable RLS.
- Define explicit policies.
- Deny access when no policy applies.
- Restrict patients to their linked record.
- Restrict staff by branch and permission.
- Protect storage objects using RLS policies.

Application-level authorization remains required even when RLS is enabled.

---

## 14. Proposed API Design

All protected routes require authentication. Every route must validate input and verify permission.

### 14.1 Authentication

```text
POST   /api/auth/invitations
POST   /api/auth/activate
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/logout-all
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
GET    /api/auth/session
POST   /api/auth/mfa/enroll
POST   /api/auth/mfa/verify
```

If Supabase Auth handles a function directly, the Express API should still verify the resulting access token for protected business routes.

### 14.2 Users and Roles

```text
GET    /api/users
GET    /api/users/:userId
PATCH  /api/users/:userId
PATCH  /api/users/:userId/status
PATCH  /api/users/:userId/roles
POST   /api/users/:userId/approve
POST   /api/users/:userId/deactivation-approval
GET    /api/roles
GET    /api/permissions
POST   /api/support-access-requests
POST   /api/support-access-requests/:requestId/approve
POST   /api/support-access-requests/:requestId/revoke
```

### 14.3 Patients

```text
GET    /api/patients
GET    /api/patients/search?q=
GET    /api/patients/next-code
GET    /api/patients/:patientId
POST   /api/patients
PATCH  /api/patients/:patientId
POST   /api/patients/:patientId/archive
GET    /api/patients/:patientId/treatments
GET    /api/patients/:patientId/appointments
GET    /api/patients/:patientId/attachments
GET    /api/patients/:patientId/invoices
GET    /api/patients/:patientId/payments
GET    /api/patients/:patientId/statement
```

### 14.4 Patient Portal

```text
GET    /api/me/patient-profile
PATCH  /api/me/patient-profile
GET    /api/me/treatments
GET    /api/me/appointments
POST   /api/me/appointment-requests
POST   /api/me/appointments/:appointmentId/cancel-request
POST   /api/me/appointments/:appointmentId/reschedule-request
GET    /api/me/balance
GET    /api/me/payments
GET    /api/me/documents
```

### 14.5 Treatments

```text
GET    /api/treatments
GET    /api/treatments/next-code
GET    /api/treatments/:treatmentId
POST   /api/treatments
PATCH  /api/treatments/:treatmentId
POST   /api/treatments/:treatmentId/corrections
POST   /api/treatments/:treatmentId/publish
GET    /api/treatments/:treatmentId/attachments
```

### 14.6 Appointments

```text
GET    /api/appointments
GET    /api/appointments/scheduling-context
GET    /api/appointments/patient-search?q=&branchId=
GET    /api/appointments/availability
GET    /api/appointments/:appointmentId
POST   /api/appointments
PATCH  /api/appointments/:appointmentId
POST   /api/appointments/:appointmentId/confirm
POST   /api/appointments/:appointmentId/reschedule
POST   /api/appointments/:appointmentId/cancel
POST   /api/appointments/:appointmentId/check-in
POST   /api/appointments/:appointmentId/start
POST   /api/appointments/:appointmentId/complete
POST   /api/appointments/:appointmentId/no-show
GET    /api/calendar
```

### 14.7 Attachments

```text
POST   /api/attachments/upload-intent
POST   /api/attachments/complete
GET    /api/attachments/:attachmentId
GET    /api/attachments/:attachmentId/download-url
DELETE /api/attachments/:attachmentId
PATCH  /api/attachments/:attachmentId
```

A direct-to-storage signed upload flow may be used, but the backend must create the upload intent, validate metadata, verify completion, and enforce ownership.

### 14.8 Finance

```text
GET    /api/invoices
GET    /api/invoices/:invoiceId
POST   /api/invoices
PATCH  /api/invoices/:invoiceId
POST   /api/invoices/:invoiceId/finalize
POST   /api/invoices/:invoiceId/void
GET    /api/payments
POST   /api/payments
POST   /api/payments/:paymentId/reverse
POST   /api/refunds
GET    /api/receivables
GET    /api/receivables/aging
GET    /api/expenses
POST   /api/expenses
PATCH  /api/expenses/:expenseId
POST   /api/expenses/:expenseId/approve
GET    /api/accounts-payable
POST   /api/accounts-payable
POST   /api/accounts-payable/:payableId/payments
GET    /api/finance/daily-summary
GET    /api/finance/reports
POST   /api/daily-closings
GET    /api/daily-closings/:closingId
POST   /api/daily-closings/:closingId/approve
```

### 14.9 Dashboard and Reports

```text
GET    /api/dashboard/summary
GET    /api/dashboard/schedule
GET    /api/dashboard/schedule-by-date?date=YYYY-MM-DD
GET    /api/dashboard/collectibles
GET    /api/dashboard/financial-summary
GET    /api/reports/collections
GET    /api/reports/receivables
GET    /api/reports/expenses
GET    /api/reports/appointments
GET    /api/reports/treatments
```

### 14.10 Audit

```text
GET    /api/audit-events
GET    /api/audit-events/:auditEventId
POST   /api/audit-events/export
```

Only the Clinic Administrator should access the complete clinic audit trail. The System Administrator may access a restricted technical and security audit view that excludes unnecessary clinical and financial content.

### 14.11 Backup and Runtime

```text
GET    /api/backups/status
POST   /api/backups
POST   /api/backups/:backupId/restore
GET    /api/runtime/status
GET    /api/health
GET    /api/ready
```

A production restore must require Clinic Administrator approval, System Administrator MFA and reauthentication, typed confirmation, a safety backup of the current environment, and complete audit events.

---

## 15. Repository Transition and Recommended Project Structure

The V2 system should be developed inside the existing repository while preserving verified clinic workflows. The repository transition must separate four decisions clearly:

1. **Keep and refactor** working source code and business rules.
2. **Replace** local-only infrastructure that is unsafe or unsuitable for online deployment.
3. **Add** the missing cloud, security, account, finance, and testing modules.
4. **Archive** local runtime data and legacy launch tools that are still needed for migration or rollback but must not be deployed as production infrastructure.

### 15.1 Repository Transition Rules

Codex and developers must follow these rules during the V2 migration:

- Preserve existing clinic behavior unless an approved V2 requirement explicitly changes it.
- Do not delete a working module before its replacement is implemented, tested, and verified.
- Make changes incrementally in focused feature branches.
- Keep the current local application available as a reference and temporary fallback during development.
- Treat the current SQLite database and local uploads as migration sources, not as production cloud infrastructure.
- Run migration and verification scripts against copies of the source data, never against the only existing copy.
- Use fictional data in development, automated tests, preview deployments, and staging.
- Do not commit real patient data, uploaded patient documents, database files, backups, production exports, or secrets.
- Record every schema change in a versioned PostgreSQL migration.
- Put all new access-control checks in the backend even when the frontend also hides unavailable actions.
- Keep unrelated modules unchanged when implementing a focused Codex task.

### 15.2 TypeScript Transition Rules

The repository will remain a single evolving codebase during the JavaScript to
TypeScript migration.

- Do not create a separate rewrite repository.
- Do not convert generated runtime data, backups, uploads, or exported patient
  files as part of the source-language migration.
- Preserve existing module boundaries when possible before introducing larger
  architectural reorganizations.
- Rename `.js` to `.ts` and `.jsx` to `.tsx` only when the file's imports,
  exports, runtime behavior, tests, and build configuration are ready.
- Keep TypeScript-only refactors separate from PostgreSQL, authentication,
  authorization, storage, and finance behavior changes whenever practical.
- New V2 modules should be TypeScript-first even while legacy V1 modules are
  still JavaScript.
- Add shared types deliberately; do not create one unrestricted global type
  file for unrelated domains.
- Use type-only imports where appropriate.
- Keep server-only types and privileged data contracts out of browser bundles.
- Every migration batch must run regression tests, type checking, and the
  relevant build before it is considered complete.

### 15.3 Files and Modules to Keep and Refactor

The following parts of the current repository contain valuable functionality and should remain in the active codebase while being reorganized or adapted for V2.

| Current file, folder, or behavior | V2 action | Required treatment |
|---|---|---|
| `client/` | Keep and refactor | Preserve working patient, treatment, appointment, dashboard, attachment, print, PDF, and export interfaces. Reorganize them into feature modules and responsive layouts. |
| `server/` | Keep and refactor | Preserve verified business rules and endpoint behavior. Move authentication, validation, controllers, services, repositories, storage, and audit concerns into clear layers. |
| Root `package.json` and workspace package files | Keep and update | Retain useful scripts and dependencies. Add database migration, test, type-check, lint, staging, and production scripts. |
| `package-lock.json` | Keep | Update only through the approved package manager. Do not manually edit it. |
| Current patient workflow | Keep | Preserve add, edit, view, search, patient classification, branch, medical alerts, and annual patient-code behavior. |
| Current treatment workflow | Keep | Preserve treatment dates, procedure entry, dentist entry, tooth numbers, remarks, follow-ups, and treatment history. |
| Current appointment workflow | Keep and extend | Preserve existing appointment history and dashboard behavior while adding requests, confirmations, rescheduling, expanded statuses, conflict prevention, and a full calendar. |
| Current payment and discount rules | Keep and formalize | Preserve current calculations, especially the rule that Senior Citizen and PWD discounts must not be doubled. Move authoritative calculations to backend services and PostgreSQL transactions. |
| Current print, PDF, and Excel export behavior | Keep and secure | Preserve useful layouts and exports. Add authorization, audit events, approved-record filtering, and privacy controls. |
| Current attachment categories and preview behavior | Keep and adapt | Preserve the user-facing workflow while replacing the storage implementation with private object storage and signed access. |
| Existing reusable React components and Tailwind classes | Keep when useful | Reuse components that remain accessible, responsive, and compatible with the V2 design system. Refactor rather than duplicate them. |
| Existing validation and formatting utilities | Keep after review | Reuse verified rules, but move authoritative validation to shared schemas and backend validation. |
| Existing fictional demo data and demo workflows | Keep after privacy review | Use only fictional data. Convert demo setup into repeatable PostgreSQL seed scripts where practical. |
| `README.md` | Keep and maintain | Treat this file as the main V2 specification. Update it when approved requirements, commands, or architecture decisions change. |

#### Existing Behavior That Must Receive Regression Tests

Before major infrastructure replacement, add tests for at least:

- Patient creation and annual patient-code generation
- Patient search
- Treatment creation and annual treatment-code generation
- Rejection of future treatment dates
- Senior Citizen and PWD discount behavior
- Amount charged, discount, net amount due, amount paid, and balance calculations
- Appointment creation, editing, follow-up creation, and status history
- Dashboard schedule filtering
- Attachment category validation and file restrictions
- Print/PDF record content
- Excel export content
- Backup inclusion of database and attachments in the legacy local version

These tests protect business behavior while the underlying database, storage, authentication, and deployment mechanisms change.

### 15.4 Local Runtime Data and Legacy Tools to Preserve for Migration or Rollback

The following items may contain important local data or provide temporary fallback capability. Preserve secure copies, but do not treat them as V2 production infrastructure.

| Current item | V2 handling |
|---|---|
| `data/dental.db` | Preserve as a read-only migration source after creating verified backups. Do not deploy it with the cloud application. |
| `data/dental.db-shm` and `data/dental.db-wal` | Include when creating a consistent SQLite backup if they exist. Do not deploy them. |
| `uploads/` | Preserve together with the matching SQLite database. Migrate files to private object storage and verify object counts and record links. |
| `exports/` | Preserve only when required by the clinic. Review exports for sensitive information and store them securely. Do not commit them. |
| `backups/` | Preserve securely outside Git. Verify that backup copies contain both database and attachment files. |
| Legacy `.bat` launchers and `startDemo.txt` | Remove from the active V2 branch after preserving `v1-local-stable`. Do not deploy or recreate them for the cloud version. |
| Demo runtime folders | Preserve only when they contain fictional data needed for testing. Convert repeatable demo creation to seed scripts. |

Before any migration, create and verify a separate safety copy of:

```text
data/
uploads/
exports/
backups/
```

The database and uploads must come from the same backup point so attachment records continue to match their files.

### 15.5 Implementations That Must Be Replaced

The following current implementations are local-only or incomplete for secure online operation and must be replaced.

| Current implementation | Replace with |
|---|---|
| SQLite through `node:sqlite` | PostgreSQL with versioned migrations, transactions, constraints, indexes, and repository-based data access |
| Local `data/dental.db` runtime dependency | Managed PostgreSQL connection configured through environment variables |
| Local `uploads/patients/` and `uploads/treatments/` storage | Private Supabase Storage or another approved private S3-compatible object store |
| Public or unrestricted `GET /uploads/...` access | Authorized attachment endpoints that return short-lived signed URLs or stream authorized files |
| Browser-provided filenames as storage paths | Random server-generated object keys with original filenames stored only as metadata |
| Extension-only upload blocking | Allowlisted extension, MIME, file-signature, size, authorization, and malware-risk validation |
| Hard-coded `localhost` and `127.0.0.1` URLs | Environment-based frontend and API URLs for development, staging, and production |
| Broad or development-only CORS configuration | Explicit production CORS allowlist and secure credential handling |
| Anonymous API access | Managed authentication plus backend session or token validation |
| Frontend-only role visibility | Backend role, permission, branch, and ownership authorization on every protected request |
| Direct SQL or complex business rules inside route files | Controller, service, repository, validation, and transaction layers |
| Current local backup page and local filesystem backup process as the primary backup plan | Managed PostgreSQL backups, separate object-storage backups, monitoring, retention rules, and restore tests |
| Direct edits to finalized payments or clinical history | Reversal, correction, adjustment, status-history, and append-only audit workflows |
| Free-text branches used as the main relationship | A normalized `branches` table referenced through `branch_id` |
| Free-text account roles | Normalized users, roles, permissions, and user-role assignments |
| Unauthenticated exports and downloads | Permission-controlled, audited, and privacy-filtered export and download operations |
| Local-only runtime assumptions | HTTPS deployment, health checks, readiness checks, monitoring, secrets management, and CI validation |

A replacement is complete only after the new implementation passes tests, migration verification, role checks, security checks, and user acceptance for the affected workflow.

### 15.6 New Files, Folders, and Modules to Add

The following capabilities do not exist completely in the current local system and should be added as dedicated modules rather than mixed into unrelated files.

#### Root Configuration and Developer Files

```text
.env.example
.nvmrc
.node-version
README.md
AGENTS.md
```

`README.md` defines what the system is, its approved requirements, and its
target architecture. `AGENTS.md` defines how Codex and other coding agents must
work inside the repository. `AGENTS.md` must reference this README rather than
duplicating the entire specification.

Add deployment configuration files only when the selected platform requires them, for example:

```text
render.yaml
vercel.json
```

Do not add provider-specific configuration before the deployment architecture is confirmed.

#### Frontend Modules

```text
client/src/api/
client/src/app/
client/src/components/
client/src/features/auth/
client/src/features/users/
client/src/features/roles/
client/src/features/patients/
client/src/features/patient-portal/
client/src/features/treatments/
client/src/features/appointments/
client/src/features/attachments/
client/src/features/billing/
client/src/features/payments/
client/src/features/collectibles/
client/src/features/expenses/
client/src/features/payables/
client/src/features/reports/
client/src/features/audit/
client/src/features/notifications/
client/src/features/dashboard/
client/src/hooks/
client/src/layouts/
client/src/pages/
client/src/routes/
client/src/schemas/
client/src/utils/
client/tests/
```

#### Backend Modules

```text
server/src/config/
server/src/controllers/
server/src/database/
server/src/middleware/
server/src/modules/auth/
server/src/modules/users/
server/src/modules/roles/
server/src/modules/patients/
server/src/modules/patient-portal/
server/src/modules/treatments/
server/src/modules/appointments/
server/src/modules/attachments/
server/src/modules/billing/
server/src/modules/payments/
server/src/modules/collectibles/
server/src/modules/expenses/
server/src/modules/payables/
server/src/modules/reports/
server/src/modules/audit/
server/src/modules/notifications/
server/src/repositories/
server/src/routes/
server/src/services/
server/src/storage/
server/src/types/
server/src/utils/
server/tests/
```

#### Database Assets

```text
database/migrations/
database/seeds/
database/functions/
database/triggers/
database/policies/
```

Required database additions include:

- UUID primary keys
- Preserved human-readable patient and treatment codes
- Yearly sequence or counter generation
- Users, roles, permissions, and user-role tables
- Staff, dentist, patient-account, and branch relationships
- Appointment status and appointment-history tables
- Invoice, invoice-item, payment, allocation, adjustment, refund, expense, payable, and daily-closing tables
- Attachment metadata with private-storage object keys
- Append-only audit events
- Constraints, indexes, foreign keys, and transactional integrity
- Optional Row Level Security policies as defense in depth

#### Migration and Operations Scripts

```text
scripts/migrate-sqlite-to-postgres.ts
scripts/verify-migration.ts
scripts/migrate-local-attachments.ts
scripts/verify-storage-migration.ts
scripts/reconcile-patient-balances.ts
scripts/seed-fictional-demo.ts
scripts/backup-storage.ts
scripts/restore-test.ts
```

Migration scripts must be:

- Idempotent where practical
- Safe to rerun
- Able to produce a clear report
- Designed to stop on invalid or ambiguous data
- Able to verify source counts, destination counts, identifiers, balances, and attachment links
- Tested first against copied fictional or sanitized data

#### Documentation

```text
docs/architecture/
docs/security/
docs/privacy/
docs/deployment/
docs/database/
docs/testing/
```

Recommended documents include:

```text
docs/architecture/system-overview.md
docs/security/permissions-matrix.md
docs/security/audit-events.md
docs/privacy/data-handling.md
docs/deployment/staging.md
docs/deployment/production.md
docs/database/schema.md
docs/database/migration-runbook.md
docs/testing/role-test-matrix.md
```

### 15.7 Recommended Project Structure

The existing `client` and `server` workspace layout can continue. The structure below is the target organization. Codex should create folders only when the requested module needs them; empty placeholder folders are not required.

```text
dental-record-system/
  client/
    src/
      api/
      app/
      components/
      features/
        appointments/
        attachments/
        audit/
        auth/
        billing/
        collectibles/
        dashboard/
        expenses/
        notifications/
        patient-portal/
        patients/
        payables/
        payments/
        reports/
        roles/
        treatments/
        users/
      hooks/
      layouts/
      pages/
      routes/
      schemas/
      styles/
      utils/
    tests/
    package.json

  server/
    src/
      config/
      controllers/
      database/
      middleware/
        authenticate.ts
        authorize.ts
        audit.ts
        error-handler.ts
        rate-limit.ts
        validate.ts
      modules/
        appointments/
        attachments/
        audit/
        auth/
        billing/
        collectibles/
        expenses/
        notifications/
        patient-portal/
        patients/
        payables/
        payments/
        reports/
        roles/
        treatments/
        users/
      repositories/
      routes/
      services/
      storage/
      types/
      utils/
      app.ts
      server.ts
    tests/
    package.json

  database/
    migrations/
    seeds/
    functions/
    triggers/
    policies/

  scripts/
    migrate-sqlite-to-postgres.ts
    verify-migration.ts
    migrate-local-attachments.ts
    verify-storage-migration.ts
    reconcile-patient-balances.ts
    seed-fictional-demo.ts
    backup-storage.ts
    restore-test.ts

  tests/
    e2e/

  docs/
    architecture/
    database/
    deployment/
    privacy/
    security/
    testing/

  .env.example
  .gitignore
  .node-version
  .nvmrc
  package.json
  package-lock.json
  README.md
  AGENTS.md
```

### 15.8 Layer Responsibilities

```text
Route
  -> Authentication and authorization middleware
  -> Request validation
  -> Controller
  -> Service
  -> Repository or storage adapter
  -> PostgreSQL or private object storage
```

Rules:

- Routes define endpoints and middleware order.
- Authentication middleware verifies the session or access token.
- Authorization middleware checks role, permission, branch, ownership, and record state.
- Validation schemas verify request parameters, query values, and request bodies.
- Controllers translate HTTP requests and responses without implementing core business rules.
- Services implement business rules, transactions, corrections, and audit decisions.
- Repositories perform parameterized database access.
- Storage adapters manage private object storage, signed URLs, object metadata, and deletion rules.
- Shared schemas and types should be reused where safe.
- Audit creation is centralized and must not depend on the frontend.
- Do not put complex SQL, authorization logic, financial calculations, or clinical business rules directly inside route files.

### 15.9 Production Deployment Inclusion Rules

The production deployment package should contain application source or build output, configuration templates, migrations, and approved operational scripts. It must not contain local clinic runtime data.

| Item | Commit to Git | Deploy to production | Notes |
|---|---:|---:|---|
| Application source | Yes | Yes | Subject to build and CI checks |
| PostgreSQL migrations | Yes | Yes | Run through controlled deployment procedures |
| Fictional seeds | Yes | Staging only | Must never contain real patient data |
| `.env.example` | Yes | Yes | Contains names and examples only, never real secrets |
| `.env` and provider secrets | No | Configure in platform | Store in approved secret management |
| `data/*.db*` | No | No | Migration source or legacy runtime only |
| `uploads/` | No | No | Migrate to private object storage |
| `exports/` | No | No | Sensitive runtime output |
| `backups/` | No | No | Store in secure backup systems |
| Real patient documents | No | No as repository files | Store only in authorized private storage |
| Build output | Usually no | Yes through CI | Follow hosting-provider requirements |
| Test reports and coverage | Usually no | No | Keep as CI artifacts when needed |

### 15.10 Git Branch Convention

Use the following integration branch for the cloud-ready V2 effort:

```text
refactor/v2-cloud-migration
```

Recommended feature branches include:

```text
refactor/typescript-foundation
refactor/typescript-backend
refactor/typescript-frontend
feature/postgresql-foundation
feature/authentication
feature/role-permissions
feature/audit-trail
feature/private-storage
feature/responsive-navigation
feature/patient-portal
feature/appointment-workflow
feature/billing-ledger
feature/collectibles
feature/expense-management
feature/daily-finance-summary
```

Branch rules:

- Create each focused feature branch from `refactor/v2-cloud-migration`.
- Do not implement unrelated modules in the same feature branch.
- Run tests, type checks, and builds before merging.
- Use clear commit messages such as `feat: add PostgreSQL patient repository` or `fix: prevent duplicate appointment slots`.
- Merge only after the affected workflow and permissions are verified.
- Preserve a stable tag for the current local version, such as `v1-local-stable`, before major V2 changes.

### 15.11 Replacement Completion Checklist

Before removing or disabling any legacy implementation, confirm all applicable items:

- [ ] The replacement is implemented.
- [ ] Unit tests pass.
- [ ] Integration tests pass.
- [ ] End-to-end tests pass for the affected workflow.
- [ ] Role, branch, and ownership restrictions are tested.
- [ ] Audit events are created correctly.
- [ ] Migration counts and identifiers match.
- [ ] Patient balances and financial totals reconcile.
- [ ] Attachment metadata and stored objects match.
- [ ] Backup and restore behavior is documented.
- [ ] Staging verification is complete using fictional data.
- [ ] Clinic user acceptance is complete when the change affects daily workflow.
- [ ] The previous implementation and migration source have a verified backup.

---

## 16. UI and Navigation

The current dashboard is clean but the V2 system needs clearer hierarchy, larger controls, role-specific views, and responsive navigation.

### 16.1 Desktop Navigation

Use a persistent left sidebar:

```text
Dashboard
Patients
Appointments
Treatments
Billing
Collectibles
Expenses
Reports
Audit Trail
Users
Settings
```

Only display modules the current role may access.

Header content:

```text
Global patient search
Notifications
Current branch
User profile
Sign out
```

Use one primary context-sensitive action, such as:

```text
+ New Patient
+ New Appointment
+ Record Payment
+ Add Expense
```

### 16.2 Mobile Navigation

Use a bottom navigation bar:

```text
Home
Patients
Schedule
Billing
More
```

The More page may contain:

- Expenses
- Reports
- Audit Trail
- Users
- Settings

Items depend on role.

### 16.3 Role-Specific Dashboards

#### Personnel Dashboard

- Today's confirmed appointments
- Pending appointment requests
- Quick patient search
- Checked-in patients
- Read-only clinical-record lookup
- Recent payments
- Outstanding balances
- Today's collections
- Quick expense entry

#### Dentist Dashboard

- Next patient
- Today's appointments
- Medical alerts
- Pending treatment notes
- Follow-up patients
- Recently viewed records
- Records awaiting patient-portal publication

#### Clinic Administrator Dashboard

- Pending staff-account approvals
- Pending operational-role approvals
- Collections and services billed
- Outstanding receivables
- Expenses and accounts payable
- Cash discrepancy
- Data-export approval requests
- Complete clinic audit alerts
- Backup status
- Restore approval requests
- Security and account warnings

#### System Administrator Dashboard

- Application and API health
- Database connection status
- Storage availability
- Backup status
- Last successful restore test
- Pending authorized account-support requests
- Pending temporary support-access requests
- Failed deployment or migration alerts
- Technical security events
- Application error summary
- Environment and version information

The System Administrator dashboard must not display patient names, clinical
details, attachments, balances, payments, expenses, or complete clinic
financial reports.

#### Owner-Dentist Combined Experience

The current doctor has both `Dentist` and `Clinic Administrator`. Their one
account may show a combined dashboard containing the allowed widgets from both
roles. The backend must still evaluate each permission using the separate role
assignments.

#### Patient Dashboard

- Next appointment
- Request appointment
- Current balance
- Recent patient-visible treatment
- Patient-visible documents
- Notifications

### 16.4 Responsive Rules

- Design mobile-first.
- Test at 360 px, 390 px, 768 px, 1024 px, 1366 px, and 1920 px widths.
- Convert wide tables to stacked cards on phones.
- Do not require horizontal page scrolling.
- Make important mobile actions full-width.
- Use large tap targets.
- Use clear focus states.
- Keep labels visible; do not rely only on placeholders.
- Make filters collapsible on small screens.
- Use sticky Save and Cancel actions on long forms.
- Preserve typed data after validation errors.
- Warn users before leaving a form with unsaved changes.
- Provide clear loading, empty, success, and error states.
- Avoid showing many visually identical cards with equal emphasis.

### 16.5 Form Design

Break long forms into sections:

```text
1. Personal Information
2. Contact and Address
3. Medical Information
4. Classification and Discounts
5. Attachments
6. Review and Save
```

Use:

- Required-field indicators
- Inline validation
- Plain-language errors
- Date pickers
- Searchable procedure fields
- Auto-save draft for long clinical forms where safe
- Unsaved-change warning
- Final review before submission

### 16.6 Accessibility

- Support keyboard navigation.
- Use semantic HTML.
- Associate labels with fields.
- Do not communicate status using color alone.
- Maintain readable contrast.
- Provide visible focus indicators.
- Use accessible modal and dialog behavior.
- Provide descriptive button labels.
- Ensure touch targets are sufficiently large and spaced.

---

## 17. Security Requirements

Dental and health information is sensitive personal information. Security is a mandatory product requirement.

### 17.1 Authentication and Session Security

- Managed authentication is preferred.
- Never store plaintext passwords.
- Require MFA for Clinic Administrator and System Administrator accounts.
- Use secure password recovery.
- Rate-limit authentication endpoints.
- Lock or slow repeated failed attempts.
- Use secure, HttpOnly, SameSite cookies when cookie sessions are used.
- Use CSRF protection for state-changing cookie-authenticated requests.
- Rotate or revoke sessions after sensitive changes.
- Provide logout from all devices.
- Do not expose session tokens in URLs.

### 17.2 API Security

- HTTPS only in staging and production
- Strict CORS allowlist
- Request validation with Zod
- Parameterized SQL only
- Authorization on every protected route
- Rate limiting
- Request body-size limits
- Security headers
- Safe error responses
- No production stack traces sent to users
- Dependency scanning
- Secret scanning
- Separate staging and production secrets
- Least-privilege database accounts
- Health endpoints must not expose secrets or patient data

### 17.3 Data Protection

- Encrypt network traffic.
- Use managed encryption at rest.
- Avoid patient information in URLs.
- Avoid patient details in analytics tools.
- Avoid full medical data in logs.
- Do not cache patient pages in a public service worker cache.
- Prevent search engine indexing of authenticated pages.
- Use private storage and signed URLs.
- Audit exports and downloads.
- Apply retention rules.
- Use correction history instead of silently overwriting clinical records.
- Test access control for every role.

### 17.4 Logging

Application logs may contain:

- Request ID
- Route
- Response status
- Execution time
- Internal error code
- User ID when appropriate
- Branch ID

Application logs must not contain:

- Passwords
- Auth tokens
- MFA codes
- Full patient histories
- Complete uploaded files
- Database connection strings
- Service-role keys

### 17.5 Security Testing

Before production:

- Test broken access control.
- Test ID enumeration and direct-object-reference attacks.
- Test patient-to-patient isolation.
- Test branch isolation.
- Test file upload bypasses.
- Test SQL injection.
- Test stored and reflected XSS.
- Test CSRF where applicable.
- Test rate limiting.
- Test session revocation.
- Test password reset abuse.
- Test export permissions.
- Test backup restore permissions.
- Test audit log tampering.

---

## 18. Privacy and Governance

The clinic must review the system under the Philippine Data Privacy Act of 2012 and National Privacy Commission guidance.

The clinic should define and approve:

- Privacy notice
- Purpose of each collected field
- Lawful basis for processing
- Data subject rights process
- Who may access each data category
- Patient record correction process
- Data-retention periods
- Backup-retention periods
- Account deactivation process
- Incident and breach response process
- Third-party hosting and processor agreements
- Data Protection Officer responsibilities
- Procedure for access and export requests
- Procedure for deletion requests where legally permitted

### 18.1 Privacy-by-Design Rules

- Collect only necessary information.
- Explain why data is collected.
- Restrict access by role and branch.
- Use the minimum data required for each screen.
- Avoid displaying medical details on shared dashboards.
- Hide sensitive content in notifications.
- Log access to records.
- Provide patient-visible privacy information in plain language.
- Review all analytics and third-party scripts before production.

This README provides technical guidance and is not a substitute for legal or accounting advice. The clinic's privacy professional and accountant should validate the final rules.

---

## 19. Backup and Recovery

Backups must cover more than the PostgreSQL database.

### 19.1 Backup Scope

- PostgreSQL database
- Private object-storage attachments
- Audit data
- Database migrations
- Storage metadata
- Environment and deployment configuration documentation
- Recovery keys and procedures stored securely outside the application repository

Database backups may contain storage metadata without containing the actual stored objects. Attachment backups therefore require a separate process.

### 19.2 Backup Rules

- Encrypt backups.
- Restrict backup access.
- Keep backups in a separate location or account.
- Define retention periods.
- Monitor backup failures.
- Test restoration regularly.
- Record backup and restore events.
- Never rely on an untested backup.
- Avoid placing backup archives in publicly accessible application folders.

### 19.3 Restore Procedure Requirements

- Restore into a safe isolated environment first when possible.
- Verify row counts.
- Verify financial totals.
- Verify attachment availability.
- Verify audit data.
- Confirm user and role behavior.
- Record the restore reason and operator.
- Require Clinic Administrator approval and System Administrator MFA and reauthentication.
- Document recovery time and recovery point objectives before production.

### 19.4 Backup Ownership and Dual Control

The System Administrator may configure backup automation, monitor backup
failures, run restore tests, and execute an approved production restore.

The Clinic Administrator must be able to view backup status, request an
on-demand backup, approve a production restore, and obtain recovery
documentation.

Production restore workflow:

1. Clinic Administrator approves the restore request.
2. System Administrator reauthenticates with MFA.
3. The system creates a safety backup of the current environment.
4. System Administrator executes the restore.
5. Database records, attachments, audit data, roles, and financial totals are
   verified.
6. Clinic Administrator confirms operational acceptance.
7. Every step is recorded in the append-only audit trail.

The clinic must retain an approved data-export and service-handover procedure.
Removing or disabling the System Administrator account must not prevent the
clinic from accessing its data, its Clinic Administrator account, or recovery
documentation.

---

## 20. Deployment Environments

Create at least three environments:

```text
Local Development
Staging / Demo
Production
```

Each environment must have separate:

- Database
- Authentication project or tenant
- Storage bucket
- Secrets
- URLs
- Email configuration
- Audit records
- Backups

Never copy real patient data into staging or development.

### 20.1 Development and Staging

Suggested low-cost stack:

| Component | Suggested Service |
|---|---|
| Frontend | Vercel Hobby or Render Static Site |
| Express API | Render Free Web Service |
| PostgreSQL | Supabase Free project |
| Authentication | Supabase Auth |
| Attachments | Supabase private Storage |

Use fictional data only.

Current provider limitations to consider:

- Vercel Hobby is restricted to non-commercial personal use. It is suitable for personal development and demonstration, not the clinic's commercial production deployment.
- Render Free web services spin down after inactivity and can take about a minute to restart.
- Render Free web services use an ephemeral filesystem. Local uploaded files and SQLite databases can be lost when the service restarts, redeploys, or spins down.
- Provider free-plan limits may change. Check official documentation before deployment.

Even during testing, use PostgreSQL and external object storage instead of relying on a local SQLite file and upload directory on the hosting server.

### 20.2 Production

Recommended production arrangement:

| Component | Recommendation |
|---|---|
| Frontend | Render Static Site as the default low-cost option; Vercel Pro is optional |
| API | Render Starter or a higher paid Web Service based on measured usage |
| Database | Supabase Pro PostgreSQL or equivalent managed PostgreSQL |
| Authentication | Supabase Auth or equivalent managed identity service |
| Attachments | Private Supabase Storage or S3-compatible private storage |
| Backups | Managed database backups plus separate object-storage backup |
| Domain | Clinic-owned custom domain |
| Monitoring | Error monitoring, uptime checks, structured logs, security alerts |
| Email | Transactional email provider for invitations, verification, password resets, security notices, and important appointment updates |
| SMS | Excluded from the initial V2 scope; do not configure an SMS provider |

### 20.3 Production Readiness Gate

Do not move real patient data to production until:

- Authentication is complete.
- Permissions are tested.
- Patient isolation is tested.
- Branch isolation is tested.
- Audit logging works.
- PostgreSQL migrations are stable.
- Private storage is working.
- Upload security is tested.
- Backups are successful.
- A restore test is completed.
- Monitoring is active.
- Privacy requirements are reviewed.
- The clinic formally accepts the system.

### 20.4 Estimated Deployment Budget

This section is for human planning as well as Codex context. Prices are
planning estimates, not fixed requirements. Provider pricing, taxes, included
usage, and exchange rates must be checked again before purchasing or launching
production.

The estimates below use an indicative exchange rate of **PHP 61.421 per USD**
from the Bangko Sentral ng Pilipinas daily peso-per-US-dollar data available on
August 6, 2026. Actual card charges may be higher because of bank conversion
rates, taxes, and foreign-transaction fees.

#### Development and Fictional-Data Staging

| Component | Plan | Estimated monthly cost |
|---|---|---:|
| Supabase database, Auth, and Storage | Free | PHP 0 |
| Render Express API | Free | PHP 0 |
| Render Static Site frontend | Free | PHP 0 |
| **Estimated total** |  | **PHP 0 per month** |

Use this setup only for development, demonstrations, automated testing, and
fictional data. Render states that its Free instances should not be used for
production applications.

#### Selected Minimum Production Baseline

This is the default production budget while preserving the approved React,
Node.js, and Express architecture.

| Component | Current reference price | Approximate PHP |
|---|---:|---:|
| Supabase Pro | USD 25/month | PHP 1,536/month |
| Render Starter Web Service | USD 7/month | PHP 430/month |
| Render Static Site frontend | USD 0/month | PHP 0/month |
| **Base infrastructure total** | **USD 32/month** | **about PHP 1,965/month** |

Approximate base annual infrastructure cost:

```text
PHP 1,965 x 12 = about PHP 23,580 per year
```

Use a practical planning allowance of **PHP 2,200 to PHP 2,500 per month** for
the initial production deployment. The allowance provides room for exchange-rate
movement, card conversion fees, a basic custom domain, and small usage changes.
It is not a substitute for monitoring actual invoices.

The base estimate assumes transactional email usage remains within a free or included allowance. If email volume exceeds that allowance, email delivery may add a small variable cost. No SMS cost is expected because SMS is outside the approved V2 scope.

#### Lower-Cost Architecture Alternative

A Supabase-Pro-only design can reduce the base service cost to approximately
**USD 25 or PHP 1,536 per month** by replacing the separately hosted Express API
with Supabase Edge Functions or another serverless design. This is **not the
default plan** because it changes the approved Express architecture, may require
package replacements, and creates additional migration and maintenance work. It
may be reconsidered only through an explicit architecture decision.

#### Costs Not Included

The base estimate does not include:

- Transactional email beyond free or included allowances
- SMS provider and per-message charges, because SMS is excluded from the initial V2 scope
- Online-payment gateway fees
- Storage, bandwidth, or compute overages
- Additional attachment-backup storage
- Paid monitoring or security services
- Taxes and bank foreign-transaction charges
- Privacy, legal, accounting, or security-review services
- Development and maintenance labor

#### Budget Rules

- Free plans may be used for fictional-data development and staging only.
- Real patient data must not be moved into production until the Production
  Readiness Gate is satisfied.
- Recheck official Supabase, Render, and BSP sources before production launch
  and during each annual budget review.
- Configure provider spending alerts or limits where available.
- Review actual usage monthly during the clinic pilot.
- Upgrade capacity based on measured performance, storage, and reliability
  requirements rather than estimates alone.

---

## 21. Environment Variables

Create `.env.example` files with placeholders only.

Suggested server variables:

```dotenv
NODE_ENV=development
PORT=3002
APP_URL=http://localhost:5173
API_URL=http://localhost:3002
TRUST_PROXY=false

DATABASE_URL=postgresql://user:password@host:5432/database
DATABASE_SSL=false

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
SUPABASE_STORAGE_BUCKET=dental-private

AUTH_JWT_ISSUER=
AUTH_JWT_AUDIENCE=

SESSION_COOKIE_NAME=dental_session
SESSION_SECRET=

CORS_ALLOWED_ORIGINS=http://localhost:5173

CLINIC_TIMEZONE=Asia/Manila
DEFAULT_CURRENCY=PHP

MAX_UPLOAD_BYTES=20971520
SIGNED_URL_TTL_SECONDS=300

LOG_LEVEL=info
ERROR_TRACKING_DSN=

EMAIL_FROM=
EMAIL_PROVIDER_API_KEY=
```

Rules:

- Never commit actual `.env` files.
- Never expose `SUPABASE_SECRET_KEY` (or a legacy Supabase `service_role` key) to the browser.
- Use hosting-provider secret management.
- Rotate exposed secrets immediately.
- Maintain separate values for staging and production.

---

## 22. Testing Strategy

### 22.1 Unit Tests

Test:

- Discount calculations
- Senior/PWD rule
- Invoice totals
- Balance calculations
- Payment allocations
- Aging bucket calculation
- Appointment status transitions
- Appointment conflict checks
- Permission decisions
- File metadata validation
- Date and timezone behavior
- Patient and treatment code generation
- Notification preference, template, and recipient rules

### 22.2 Integration Tests

Test:

- Patient creation with PostgreSQL
- Treatment creation transaction
- Appointment booking conflict
- Payment and invoice updates
- Payment reversal
- Expense approval
- Daily closing
- Audit event creation
- Private attachment metadata
- User invitation and role assignment
- In-app notification creation and email delivery-state recording
- Appointment status changes queue the correct email without including unnecessary sensitive data

### 22.3 End-to-End Tests

Required user journeys:

1. Personnel logs in and creates a patient.
2. Personnel views the complete clinical record in read-only mode.
3. Dentist creates and finalizes a treatment.
4. Personnel creates an invoice.
5. Personnel records a partial payment.
6. Balance appears in Collectibles.
7. Patient logs in and sees only their own patient-visible data.
8. Patient requests an appointment.
9. Personnel confirms the appointment.
10. Patient requests cancellation.
11. Patient receives an in-app notification and an email for the confirmed or
    changed appointment.
12. Personnel records a clinic expense with a receipt photo.
13. The doctor uses one account with both Dentist and Clinic Administrator
    permissions.
14. Clinic Administrator approves a staff account and operational role.
15. System Administrator completes the approved technical provisioning.
16. System Administrator cannot view clinical or financial records by default.
17. System Administrator cannot grant a privileged role to their own account.
18. Clinic Administrator reviews the daily finance summary and complete clinic
    audit trail.
19. Clinic Administrator approves a restore and System Administrator executes
    it using MFA and reauthentication.
20. Temporary support access expires automatically and all access is audited.
21. Unauthorized users are denied access.
22. Attachment URLs expire.
23. Backup and restore verification succeeds.

### 22.4 Role Test Matrix

For every protected endpoint, test:

- Unauthenticated user
- Patient linked to the target record
- Patient linked to another record
- Personnel in the same branch
- Personnel in another branch
- Dentist in the same branch
- Dentist without the required permission
- Clinic Administrator without the Dentist role
- Owner-Dentist with both Dentist and Clinic Administrator roles
- System Administrator without temporary support access
- System Administrator with approved, scoped, unexpired temporary support
  access
- System Administrator with expired or revoked support access
- Deactivated account

### 22.5 Required Commands

The exact scripts may evolve, but the project should provide:

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run test:e2e
npm run db:migrate
npm run db:rollback
npm run db:seed:demo
```

---

## 23. Implementation Roadmap

This section is the high-level product roadmap. The exact implementation task IDs and subphases used during development are tracked in Section 27 and must match the task files under `docs/codex-prompts/`. When a new task phase or subphase is approved and added under `docs/codex-prompts/`, update Section 27 in the same documentation change so the README and task registry remain aligned.

### Phase 1: Requirements and Safety Baseline

- Confirm the five-role model, the owner-dentist dual-role assignment, and the System Administrator restrictions.
- Confirm clinic branches.
- Confirm appointment workflow.
- Confirm financial terminology.
- Confirm privacy responsibilities.
- Finish automated regression tests for existing critical business rules.
- Create a fictional staging dataset.

### Phase 2: TypeScript Foundation and Selective Migration

- Add TypeScript configuration for the root, client, and server as appropriate.
- Add `npm run typecheck` and make type checking part of the validation workflow.
- Allow JavaScript and TypeScript to coexist temporarily during migration.
- Define shared domain types and runtime-validation boundaries.
- Convert stable utilities and existing business-rule modules only in focused
  batches that clearly support the next approved V2 step.
- Reuse successful TypeScript modules and preserve compatibility bridges where
  live consumers still depend on them.
- Use `.ts` for non-React TypeScript and `.tsx` for React JSX modules.
- Keep TypeScript-only conversions separate from unrelated behavior changes where practical.
- Require regression tests, type checking, and builds to stay green after every migration batch.
- Write new V2 modules in TypeScript by default.

### Phase 3: Migration Strategy Transition

- Record the selective-replacement migration strategy in repository
  architecture documentation.
- Classify current implementation areas as keep, adapt, replace, bridge, or
  retire-later.
- Document legacy retirement gates and parity expectations.
- Confirm that PostgreSQL and future V2 slices should not wait on broad
  JavaScript/JSX elimination.

### Phase 4: PostgreSQL Foundation

- Configure PostgreSQL.
- Add migration tooling.
- Create UUID-based schema.
- Create yearly counter mechanism.
- Create repositories and service layers.
- Add database constraints and transactions.
- Verify patient, treatment, appointment, discount, and balance behavior.

### Phase 5: V2 Vertical Replacement Slices

- Implement V2 capabilities in focused vertical slices instead of requiring
  full horizontal conversion of the remaining V1 stack first.
- Reuse, adapt, bridge, replace, or retire legacy areas according to the
  approved migration map.
- Remove legacy paths only after replacement parity and retirement gates are
  satisfied.

### Phase 6: Authentication and Authorization

- Integrate Supabase Auth or approved provider.
- Add staff invitation flow.
- Add patient activation flow.
- Add role and permission tables.
- Add backend authentication middleware.
- Add backend authorization middleware.
- Add branch restrictions.
- Add MFA for Clinic Administrator and System Administrator accounts.
- Add patient ownership checks.
- Add Clinic Administrator approval workflows for accounts, roles, exports, and restores.
- Add System Administrator self-elevation prevention.
- Add scoped, expiring temporary support-access workflow.

### Phase 7: Audit Trail

- Create `audit_events` table.
- Add request IDs and correlate backend-observed HTTP audit events.
- Add centralized audit service.
- Add Clinic Administrator-only complete audit review/export APIs.
- Audit audit-trail viewing/export and selected authenticated authorization denials.
- Protect audit log from modification.
- Audit backend-observed account approvals and technical provisioning events as those workflows are implemented.
- Defer browser-to-Supabase login/password audit claims until the Dental System backend can truthfully observe those provider events.
- Defer Patient/Treatment/Appointment, attachment, finance, backup/restore, and MFA audit coverage to their protected V2 implementation phases.

### Phase 8: Private Attachments and Camera Capture

Private attachment/storage foundation is completed through task Phase 10:

- Private Supabase Storage bucket is configured and live-validated in development.
- PostgreSQL UUID attachment metadata and branch-scoped RBAC are implemented.
- Upload-intent/completion with random object keys, signature/content validation, and server-side SHA-256 are implemented.
- Authorized short-lived signed download URLs are implemented.
- The active V2 server no longer exposes unrestricted `/uploads` or anonymous local attachment routes.
- Attachment lifecycle and access tests are implemented.
- Camera capture, preview/retake/rotate/crop enhancements remain deferred to a later UI-focused task.
- Attachment backup/restore remains a Phase 18 Backup / Recovery dependency.

### Task Phase 12: Appointment Redesign

- Replace the legacy SQLite appointment runtime with a protected PostgreSQL V2 workflow.
- Add stable machine statuses, Dentist/provider assignment, duration, cancellation/reschedule lineage, and append-only appointment history.
- Add Personnel/Dentist branch-scoped appointment RBAC while preserving the rule that Clinic Administrator and System Administrator receive no routine clinical access by role alone.
- Enforce transaction-safe Dentist double-book prevention across branches.
- Add protected scheduling/availability APIs and a day/week/mobile-agenda calendar experience.
- Preserve clinic-wide patient identity while recording the actual appointment branch.
- Prepare requested/pending-confirmation states for later patient self-service without implementing the Patient Portal in this phase.
- Appointment in-app/email notifications remain Phase 13; SMS remains excluded.

### Task Phase 13: Notifications

- Add in-app notifications for important appointment and account events.
- Add transactional email notifications and retry/delivery tracking.
- Integrate with Phase 12 appointment transitions without making successful appointment writes depend on email delivery.
- Do not add SMS providers, SMS templates, SMS delivery tables, or SMS environment variables unless a later approved requirement changes the policy.

### Task Phase 14: Patient Portal

- Add patient dashboard.
- Add approved treatment history.
- Add OWN-scoped patient appointment request, cancellation-request, and reschedule-request workflows using the Phase 12 appointment domain.
- Add balance and payment history.
- Add approved documents.
- Add privacy information.

### Task Phase 15: Finance / Collectibles

- Add invoices and invoice items.
- Add payments and allocations.
- Add reversals, refunds, and adjustments.
- Add receivables and aging.
- Add Collectibles dashboard card and page.
- Add expenses and categories.
- Add suppliers and accounts payable.
- Add daily financial summary.
- Add daily cash closing.
- Add reports and controlled exports.

### Task Phase 16: Role Dashboard

- Add role-specific dashboard content and shortcuts using already protected domain APIs.
- Keep System Administrator views technical and exclude routine patient/clinical/financial data.
- Keep Clinic Administrator administrative/business authority separate from Dentist clinical authority.

### Task Phase 17: Responsive UI / Accessibility

- Add desktop sidebar.
- Add mobile bottom navigation.
- Convert large mobile tables to cards or appropriate mobile layouts.
- Improve forms and validation.
- Add keyboard and accessibility checks.
- Test required viewport sizes.

### Task Phase 18: Backup / Recovery

- Implement cloud-compatible backup and recovery controls.
- Add backup monitoring and complete a restore test.
- Preserve private object-storage and PostgreSQL consistency.

### Task Phase 19: Integration / End-to-End / Security Testing

- Run protected end-to-end workflows across authentication, authorization, branches, clinical modules, storage, audit, notifications, and finance as implemented.
- Complete permission, negative-path, concurrency, and security testing.

### Task Phase 20: User Acceptance Testing

- Complete clinic user acceptance testing with approved fictional/non-production data.
- Resolve UAT findings before production readiness.

### Task Phase 21: Production Readiness

- Configure production deployment only after all prior gates are complete.
- Add required CI, error monitoring, uptime monitoring, and operational controls.
- Complete privacy, security, accounting, backup/recovery, and production-readiness review before authorizing real patient data.

---

## 24. Priority Order

### Development Modernization Before Major V2 Feature Work

1. Finish the V1 regression safety net.
2. Establish the TypeScript toolchain and type-check command.
3. Reuse stable shared foundations and migrate only the pieces that directly
   support the next approved V2 step.
4. Keep regression tests and production builds green.
5. Do not treat complete JavaScript/JSX elimination as a prerequisite for
   PostgreSQL or early V2 replacement slices; write new V2 modules in
   TypeScript/TSX.

This modernization sequence supports the migration but does not replace the
security and production-readiness requirements below.

### Must Be Completed Before Public Use

1. PostgreSQL
2. Private object storage
3. Authentication
4. Backend authorization
5. Patient ownership protection
6. Branch restrictions
7. Audit logging
8. HTTPS and API hardening
9. Backup and restore
10. Staging and security testing

### First Operational Cloud Release

1. Current patient and treatment functions
2. Staff accounts
3. Patient portal
4. Appointment requests and cancellation
5. Collectibles and receivables
6. Invoice and payment ledger
7. Expense recording
8. Daily finance summary
9. Mobile camera capture
10. Responsive interface

### Later Enhancements

- Optional SMS notifications only after a separate clinic approval, architecture review, privacy review, and operating-budget review
- Online payments
- Inventory management
- Dental laboratory-work tracking
- Electronic consent signatures
- Dentist performance reports
- Multi-branch consolidated reporting
- Accounting-system integration
- Advanced analytics
- Waiting list
- Carefully designed offline contingency mode

---

## 25. Acceptance Criteria

### 25.0 TypeScript Migration

- The project provides a working `npm run typecheck` command.
- New V2 modules use TypeScript/TSX by default.
- Existing JavaScript/JSX is converted incrementally rather than through an uncontrolled rewrite.
- Regression-tested V1 behavior remains unchanged during conversion.
- Type errors are fixed rather than broadly suppressed with `any` or unsafe assertions.
- External input continues to use runtime validation even when TypeScript types exist.
- Frontend contracts do not expose server-only secrets or privileged internal data shapes.
- The relevant tests, type check, and production build pass for each migration batch.

### 25.1 Authentication

- Staff cannot access protected pages without signing in.
- Patients only see their linked patient-visible records.
- The current doctor uses one account assigned both `Dentist` and `Clinic
  Administrator`.
- Clinic Administrator approves staff accounts and operational roles.
- System Administrator performs technical provisioning only after clinic
  approval.
- MFA is required for Clinic Administrator and System Administrator accounts.
- System Administrator cannot assign a privileged role to their own account.
- Deactivated users lose access.
- Account impersonation is prohibited.

### 25.2 Authorization

- Permissions are enforced by the Express API.
- Changing a request ID does not expose another patient's record.
- Staff cannot access unauthorized branches.
- Hidden buttons are not the only access control.
- Personnel can view complete clinical records in read-only mode but cannot finalize or correct treatments.
- System Administrator has no routine access to clinical, attachment, or financial data.
- Temporary support access is approved, scoped, expiring, revocable, and audited.

### 25.3 Audit

- Viewing and editing sensitive data creates audit entries.
- Payments, expenses, exports, downloads, and role changes are audited.
- Audit records cannot be edited through the app.
- Audit exports are audited.

### 25.4 Appointments

- Patients can request appointments.
- Staff can confirm or propose another time.
- Cancellation preserves history.
- Double booking is prevented transactionally.
- Appointments display correctly on mobile and desktop.
- Important appointment status changes create an in-app notification and queue an email.
- Normal appointment operation does not depend on SMS.

### 25.5 Attachments

- Mobile users can take a photo or choose a file.
- Files are stored privately.
- Unauthorized users cannot access files.
- Signed links expire.
- Unsafe files are rejected.
- Uploads and downloads are audited.

### 25.6 Finance

- Invoices, payments, discounts, refunds, and balances are separate records.
- Partial payment updates the remaining balance correctly.
- Collectibles show accurate aging.
- Payments cannot be silently overwritten.
- Expenses affect daily summaries.
- Cash closing shows expected, actual, and difference.
- Money uses decimal-safe storage and calculations.

### 25.7 Responsive UI

- No horizontal page scroll at supported phone widths.
- Main actions are easy to tap.
- Mobile tables use readable card or responsive layouts.
- Forms preserve data after validation errors.
- Keyboard navigation and focus states work.

### 25.8 Deployment and Recovery

- Staging uses fictional data.
- Production uses paid or production-suitable services.
- Database and attachment backups both exist.
- Clinic Administrator can view backup status and approve a restore.
- System Administrator can execute only an approved restore using MFA and
  reauthentication.
- A restore test succeeds.
- The clinic retains recovery documentation and a data-export/handover
  procedure.
- Monitoring detects application and backup failures.

---

## 26. Codex Development Rules

Codex must follow these rules when changing the project:

1. Read this README, all applicable `AGENTS.md` files, and the relevant existing code before modifying files.
2. Preserve current clinic business rules unless the requested task explicitly changes them.
3. Work on one approved phase or issue at a time.
4. Do not expose the current local application publicly before security prerequisites are complete.
5. Do not use real patient data in tests, seeds, screenshots, or staging.
6. Use PostgreSQL migrations for every schema change.
7. Never modify an old applied migration; add a new migration.
8. Use UUID primary keys and preserve human-readable patient/treatment codes.
9. Do not use `MAX(...) + 1` for annual code generation.
10. Do not use JavaScript floating-point arithmetic as the final authority for money.
11. Use database transactions for treatment, appointment, payment, refund, and closing workflows.
12. Validate every API input.
13. Authenticate and authorize every protected backend route.
14. Do not rely on hidden frontend buttons for security.
15. Do not expose Supabase service-role keys in the client.
16. Do not use a public storage bucket for patient files.
17. Do not store production files on an ephemeral server filesystem.
18. Do not directly overwrite finalized payments or submitted closings.
19. Do not silently delete clinical or financial history.
20. Create audit entries for sensitive reads and writes.
21. Never log passwords, tokens, verification codes, or full health records.
22. Add or update tests for every changed business rule.
23. Run lint, type checking, tests, and build before declaring a task complete.
24. Report failed checks honestly.
25. Update documentation when architecture, schema, endpoints, environment variables, or workflows change.
26. Keep staging and production configuration separate.
27. Use clear commit-sized changes and avoid unrelated rewrites.
28. Ask for a clinic decision when a requirement involves legal, privacy, tax, accounting, or clinical policy that is not defined here.
29. Do not add SMS dependencies, providers, templates, delivery logs, environment variables, or UI flows unless a later explicitly approved requirement reintroduces SMS.
30. Implement `Dentist`, `Clinic Administrator`, and `System Administrator` as separate roles.
31. Assign the current doctor both `Dentist` and `Clinic Administrator` in fictional seeds and role tests; do not create duplicate accounts for the same doctor.
32. Do not give the System Administrator routine patient, clinical, attachment, or financial access.
33. Prevent the System Administrator from assigning privileged roles to their own account or bypassing clinic approval.
34. Require Clinic Administrator approval and System Administrator execution for production restores.
35. Implement temporary support access as approved, scoped, expiring, revocable, and fully audited.
36. Do not implement account impersonation.
37. New V2 application source should use TypeScript/TSX by default unless an approved exception is documented.
38. Migrate existing JavaScript incrementally; do not perform a whole-application TypeScript rewrite in one task.
39. Preserve regression-tested behavior during TypeScript conversion.
40. Do not use `any`, `@ts-ignore`, unsafe type assertions, or disabled compiler checks as broad substitutes for fixing type errors.
41. TypeScript types do not replace runtime validation at API, environment, database, storage, or other trust boundaries.
42. Run `npm run typecheck`, relevant tests, and the relevant production build before declaring a TypeScript migration task complete.
43. Keep the task-phase registry in Section 27 synchronized with `docs/codex-prompts/`. When a phase/subphase task file is added, renamed, superseded, or retired, update the README in the same change. Empty placeholder prompt files are planning markers only and are not approved implementation specifications until their scope is written and approved.

### 26.1 Codex Task Completion Format

For each implementation task, Codex should report:

```text
Summary
Files Changed
Database Migrations
Security Impact
Tests Added or Updated
Commands Run
Results
Manual Testing Steps
Known Limitations
Next Recommended Task
```

---

## 27. Codex Task Phase Registry

This is the task-level execution sequence for the V2 migration. It is the README counterpart of `docs/codex-prompts/` and must stay synchronized with that folder.

### Completed / Current Task Phases

| Task ID | Task | Current Status |
| --- | --- | --- |
| 01 | V1 Regression Safety Net | Completed. Critical V1 business behavior is protected by regression tests. |
| 02 | Legacy Cleanup | Earlier cleanup completed. A separate fresh-V2 mock/runtime-data cleanup follow-up has been approved in principle but has not yet been assigned a new implementation phase. |
| 03 | TypeScript Foundation | Completed. Incremental TypeScript toolchain and type-check workflow established. |
| 04 | TypeScript Migration Batches 1–5 | Completed for the approved migration batches; JavaScript/TypeScript coexistence remains intentional where V1 bridges are still needed. |
| 05 | PostgreSQL Foundation / V2 Selective-Replacement Transition | Completed. PostgreSQL migration tooling and selective-replacement architecture are established. |
| 06 | Core PostgreSQL Data Model / Migration-Parity Batches | Completed for Patient, Treatment, and Appointment persistence foundations. The current V2 database is treated as a fresh database; old mock SQLite records do not need to be migrated. |
| 07A | V2 Patient Domain Replacement — Read Path | Completed internally. |
| 07B | V2 Patient Domain Replacement — Write Path | Completed internally. |
| 07C | V2 Patient Domain Hardening / Cutover Readiness | Completed. Protected HTTP route cutover remains deferred until the required security/integration gates are satisfied. |
| 07 Final | Patient Domain Review / Closure | Completed for the internal PostgreSQL Patient domain foundation. |
| 08A | Authentication Foundation | Completed. |
| 08B | Express Authentication Middleware / Protected Session Boundary | Completed. |
| 08C | Client Authentication, Session, Login, and Recovery | Completed. |
| 08D | Application User Identity, Status, Roles, and Branch Foundation | Completed. |
| 08E | Authorization / RBAC Foundation | Completed. |
| 08F | Express Authorization Middleware / Protected RBAC Boundary | Completed. |
| 08G | Clinic Administrator Staff Account Management Foundation | Completed. |
| 08H | Append-Only Security and Account Audit Foundation | Completed. |
| 08I | Supabase Staff Provisioning and Activation | Completed and committed. |
| 08J | Initial Owner / Dentist Bootstrap | Completed. Real Supabase invitation/recovery activation, password login, PostgreSQL activation state, exact owner roles, LILAC branch assignment, audit events, linked Supabase identity, and one-time bootstrap-disable condition were validated in the development environment. |
| 08K | Clinic / Branch Operating Model Foundation | Completed. Flexible user branch memberships, clinic-wide patient identity semantics, explicit treatment branch context, initial branch bootstrap, and migration 0008 were validated against the development Supabase PostgreSQL database. |
| 09 | Audit Trail Expansion / Review Foundation | Completed. Request correlation, Clinic Administrator-only audit review/export, audit-of-audit-access, selected authorization-denial coverage, CSV formula-injection protection, defensive metadata redaction, and migration 0009 are implemented and validated. Development Supabase confirms migrations 0001–0009 are applied. |
| 10 | Private Storage Foundation | Completed for the approved backend/private-storage scope. Migration 0010, private Supabase Storage, attachment RBAC, UUID metadata, signed upload/completion, signature/SHA-256 validation, signed download authorization, metadata update, soft delete, request-correlated audit events, and retirement of unrestricted V2 `/uploads`/anonymous attachment routes are implemented. Development Supabase confirms migrations 0001–0010 are applied and the fictional live Storage lifecycle passed. Camera editing UX and parent-domain attachment listing cutover remain deferred. |

The older empty umbrella markers `07-Authentication.txt` and `08-Authorization-RBAC.txt` are retained only as historical planning placeholders. The implemented work is represented by the detailed 07A–07C, 08A–08K, 09, and 10 task specifications above.

### Planned Task Phases

Phases 09 and 10 are complete for their approved scopes under `docs/codex-prompts/09-Audit-Trail.txt` and `docs/codex-prompts/10-Private-Storage.txt`. Phase 11 Early Staging has completed its approved staging scope under `docs/codex-prompts/11-Early-Staging.txt` and `docs/deployment/staging.md`: isolated Supabase staging database/Auth/private Storage, migrations 0001–0011, Vercel frontend, Render API, verified TLS/readiness, staged owner activation/login, legacy-route isolation, and fictional private-attachment lifecycle were live-validated. This does NOT authorize production or real patient data. Phase 12 Appointment Redesign is now approved under `docs/codex-prompts/12-Appointment-Redesign.txt`; implementation must proceed in reviewed subphases 12A–12D. Phases 13–21 remain planning placeholders requiring separate approval.

| Task ID | Planned Task |
| --- | --- |
| 11 | Early Staging — Completed for approved scope. Vercel frontend, Render API, Supabase staging Auth/PostgreSQL/private Storage, owner activation/login, negative route checks, and fictional attachment lifecycle live-validated; production remains out of scope |
| 12 | Appointment Redesign — In progress. 12A schema/workflow/RBAC is complete and staging-synchronized; 12B PostgreSQL domain/conflict safety is implemented locally and pending review; 12C protected API and 12D scheduling/calendar UI remain pending. Notifications and Patient Portal remain Phases 13 and 14 |
| 13 | Notifications |
| 14 | Patient Portal |
| 15 | Finance / Collectibles |
| 16 | Role Dashboard |
| 17 | Responsive UI / Accessibility |
| 18 | Backup / Recovery |
| 19 | Integration / End-to-End / Security Testing |
| 20 | User Acceptance Testing |
| 21 | Production Readiness |

Before starting any planned phase, compare its intended scope with completed subphases so already-built foundations are not duplicated. Phase 12 must build on the completed PostgreSQL appointment foundation plus authentication, authorization, audit, branch, and staging foundations rather than recreate them. Appointment notifications stay in Phase 13 and patient self-service appointment requests stay in Phase 14.

Do not combine PostgreSQL, authentication, storage, finance, or broad TypeScript migration into one task. Keep each approved phase reviewable and protected by the regression-test baseline.

---

## 28. Reference Links

Technical and security decisions should be checked against current official documentation before production because cloud plans, limits, and recommendations can change.

### Runtime and Frontend

- Node.js release status: https://nodejs.org/en/about/previous-releases
- Tailwind responsive design: https://tailwindcss.com/docs/responsive-design
- WCAG target size guidance: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

### Camera and Uploads

- HTML capture attribute: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture
- `getUserMedia`: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- Taking still photos: https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Taking_still_photos
- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html

### Security

- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP MFA Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- OWASP CSRF Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

### PostgreSQL and Supabase

- PostgreSQL Row Security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase secure data guidance: https://supabase.com/docs/guides/database/secure-data
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase database backups: https://supabase.com/docs/guides/platform/backups
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod

### Hosting and Budget

- Supabase pricing: https://supabase.com/pricing
- Vercel plans: https://vercel.com/docs/plans
- Vercel fair use guidelines: https://vercel.com/docs/limits/fair-use-guidelines
- Render pricing: https://render.com/pricing
- Render free services: https://render.com/docs/free
- Render web services: https://render.com/docs/web-services
- Render persistent disks: https://render.com/docs/disks
- BSP daily Philippine peso per US dollar rate: https://www.bsp.gov.ph/statistics/external/day99_data.aspx

### Philippine Privacy

- Data Privacy Act of 2012: https://privacy.gov.ph/data-privacy-act/
- Implementing Rules and Regulations: https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/
- Data subject rights: https://privacy.gov.ph/data-subject-rights/
- National Privacy Commission: https://privacy.gov.ph/

---

## 29. Final Technical Direction

The target production stack is:

```text
Frontend
- React
- TypeScript / TSX
- Vite
- Tailwind CSS
- React Router
- TanStack Query
- React Hook Form
- Zod

Backend
- Node.js LTS
- Express
- TypeScript
- Zod validation
- pg
- PostgreSQL migrations
- Structured audit middleware

Cloud
- Supabase PostgreSQL
- Supabase Auth
- Supabase private Storage
- Render API hosting
- Render Static Site frontend hosting as the default low-cost production option
- Vercel Pro as an optional frontend alternative

Quality
- Vitest
- React Testing Library
- Supertest
- Playwright
- CI checks
- Automated backups
- Restore testing
- Error and uptime monitoring
- In-app notifications and transactional email
- No SMS integration in the initial V2 scope
```

Role model
- Patient
- Personnel
- Dentist
- Clinic Administrator / Clinic Owner
- System Administrator / Developer
- Current doctor: one account with Dentist + Clinic Administrator
- Developer: System Administrator only
- No account impersonation
- No routine System Administrator access to clinical or financial data
- Clinic Administrator approves production restore; System Administrator executes it

The system must prioritize authentication, authorization, privacy, auditability, private storage, financial integrity, backups, and recovery before public deployment with real patient information.
