# Current System Audit

## 1. Executive summary

### Verified findings

The current repository is a localhost-oriented monorepo with a React + Vite client in `client/` and an Express + SQLite backend in `server/`. The active implementation preserves core V1 clinic workflows for patients, treatments, appointments, attachments, exports, and local backups, but it does not yet implement the approved V2 security and cloud architecture from [README.md](/mnt/d/dental-record-system/README.md).

The largest gaps are structural rather than cosmetic:

- No authentication, authorization, role enforcement, patient isolation, or branch isolation are present in the active API surface: `server/src/app.js`, `server/src/routes/*.js`.
- No append-only audit trail, user/role schema, patient portal, notification system, PostgreSQL migrations, or private object storage exists in the active codebase: `server/src/db/database.js`.
- Current attachments, exports, and backups are still local-filesystem based and conflict with the V2 requirement for private cloud storage, controlled exports, and dual-control restore workflows: `server/src/utils/attachmentUtils.js`, `server/src/services/exportService.js`, `server/src/services/backupService.js`.
- Automated coverage is minimal and does not protect most business rules called out in `AGENTS.md` and `README.md`: `server/src/services/dashboardService.test.js`, `client/src/lib/backupUi.test.js`.

The existing implementation should be treated as a business-rule reference system, not as a V2-ready secure architecture.

### Assumptions and unanswered questions

- This audit did not inspect SQLite row contents, uploaded files, or export payload contents, to avoid exposing possible patient data.
- Findings are based on the repository state in `/mnt/d/dental-record-system` on August 6, 2026, including current local runtime artifacts in `data/`, `uploads/`, `exports/`, and `backups/`.

## 2. Current repository structure

### Verified findings

Top-level structure currently includes:

- `client/`: React + Vite frontend workspace.
- `server/`: Express backend workspace.
- `data/`: local SQLite runtime database files including `dental.db`, `dental.db-shm`, and `dental.db-wal`.
- `uploads/`: local attachment storage with `patients/` and `treatments/`.
- `exports/`: local Excel export destination.
- `backups/`: local backup destination with timestamped backup folders.
- `.codex/agents/`: project-scoped subagent configuration files.

The root workspace is declared in [package.json](/mnt/d/dental-record-system/package.json) with workspaces `client` and `server`. Current root scripts are operational and local-workflow oriented:

- `dev`
- `dev:server`
- `dev:client`
- `demo:prepare`
- `dev:demo`
- `demo:reset`
- `demo:cleanup`
- `demo`
- `backup:create`
- `build`
- `start`

Notable V2-target folders and files described in `README.md` are currently absent:

- `database/`
- root `scripts/`
- `tests/e2e/`
- `docs/` before this audit
- `.env.example`
- `.nvmrc`
- `.node-version`

### Assumptions and unanswered questions

- The existing `backups/` directory appears to contain runtime backup artifacts. This audit did not inspect their internal data payloads beyond manifest/path structure.

## 3. Frontend architecture and major workflows

### Verified findings

Frontend bootstrapping is in [client/src/main.jsx](/mnt/d/dental-record-system/client/src/main.jsx). It mounts `App` inside `BrowserRouter` and `RuntimeStatusProvider`.

Client routing is centralized in [client/src/App.jsx](/mnt/d/dental-record-system/client/src/App.jsx). The active page surface is:

- `/`: `DashboardPage`
- `/patients`: `PatientSearchPage`
- `/patients/new`: `PatientFormPage`
- `/patients/:patientId`: `PatientDetailPage`
- `/patients/:patientId/edit`: `PatientFormPage`
- `/patients/:patientId/appointments/new`: `AppointmentFormPage`
- `/patients/:patientId/appointments/:appointmentId/edit`: `AppointmentFormPage`
- `/patients/:patientId/treatments`: `PatientTreatmentHistoryPage`
- `/treatments/new`: `TreatmentFormPage`
- `/treatments/:treatmentId`: `TreatmentDetailPage`
- `/treatments/:treatmentId/edit`: `TreatmentFormPage`
- `/print/patients/:patientId`: `PrintPatientPage`
- `/print/treatments/:treatmentId`: `PrintTreatmentPage`
- `/print/patients/:patientId/treatments`: `PrintPatientHistoryPage`
- `/settings`: `SettingsPage`

Main shared frontend surfaces:

- API client: [client/src/lib/api.js](/mnt/d/dental-record-system/client/src/lib/api.js)
- Layout/navigation: [client/src/components/Layout.jsx](/mnt/d/dental-record-system/client/src/components/Layout.jsx)
- Runtime mode context: [client/src/context/RuntimeStatusContext.jsx](/mnt/d/dental-record-system/client/src/context/RuntimeStatusContext.jsx)
- Form defaults/options: [client/src/lib/forms.js](/mnt/d/dental-record-system/client/src/lib/forms.js)
- Client-side validation: [client/src/lib/validation.js](/mnt/d/dental-record-system/client/src/lib/validation.js)
- Attachment helpers: [client/src/lib/attachments.js](/mnt/d/dental-record-system/client/src/lib/attachments.js)
- PDF generation: [client/src/lib/pdf.js](/mnt/d/dental-record-system/client/src/lib/pdf.js)
- Backup UI logic: [client/src/lib/backupUi.js](/mnt/d/dental-record-system/client/src/lib/backupUi.js)

Major current workflows visible in the frontend:

- Dashboard and schedule views: `DashboardPage`
- Patient create/edit/search/detail: `PatientSearchPage`, `PatientFormPage`, `PatientDetailPage`
- Appointment create/edit from patient context: `AppointmentFormPage`, `PatientAppointmentsTable`
- Treatment create/edit/detail/history: `TreatmentFormPage`, `TreatmentDetailPage`, `TreatmentHistoryTable`, `PatientTreatmentHistoryPage`
- Attachment upload/preview/delete/download: `AttachmentUploadForm`, `AttachmentGallery`
- Print/PDF record views: `PrintPatientPage`, `PrintTreatmentPage`, `PrintPatientHistoryPage`, `PrintableDocument`
- Backup status and manual backup UI: `SettingsPage`, `backupUi.js`

The frontend is not environment-driven yet. [client/src/lib/api.js](/mnt/d/dental-record-system/client/src/lib/api.js) hard-codes:

- `http://127.0.0.1:3002/api`
- direct export URLs
- direct upload URLs
- direct attachment download URLs

There is also a verified route mismatch: `getDashboardTodaySummary()` in `client/src/lib/api.js` calls `/dashboard/today-summary`, but no such backend endpoint is mounted in `server/src/routes/dashboard.js`.

### Assumptions and unanswered questions

- This audit did not map every JSX component in full detail. The workflow summary is based on route registration, page files, and shared libraries.

## 4. Backend architecture, routes, middleware, services, and data access

### Verified findings

Backend entry points:

- Process startup: [server/src/index.js](/mnt/d/dental-record-system/server/src/index.js)
- Express app bootstrap: [server/src/app.js](/mnt/d/dental-record-system/server/src/app.js)

`server/src/app.js` currently configures:

- CORS for `http://127.0.0.1:5173` and `http://localhost:5173`
- `express.json({ limit: "10mb" })`
- static file serving for `/uploads`
- `/api/health`
- mounted routers for runtime, dashboard, patients, treatments, appointments, attachments, export, and backup
- a single error handler

There is no `server/src/middleware/` directory and no authentication, authorization, audit, rate-limit, or request-validation middleware layer consistent with the V2 architecture.

Active backend routes:

- Patients: [server/src/routes/patients.js](/mnt/d/dental-record-system/server/src/routes/patients.js)
  - `GET /api/patients`
  - `GET /api/patients/next-id`
  - `GET /api/patients/search`
  - `GET /api/patients/:patientId`
  - `POST /api/patients`
  - `PUT /api/patients/:patientId`
  - `GET /api/patients/:patientId/treatments`
  - `GET /api/patients/:patientId/attachments`
  - `GET /api/patients/:patientId/appointments`
  - `POST /api/patients/:patientId/appointments`

- Treatments: [server/src/routes/treatments.js](/mnt/d/dental-record-system/server/src/routes/treatments.js)
  - `GET /api/treatments`
  - `GET /api/treatments/next-id`
  - `GET /api/treatments/:treatmentId`
  - `GET /api/treatments/:treatmentId/attachments`
  - `POST /api/treatments/:treatmentId/attachments`
  - `POST /api/treatments`
  - `PUT /api/treatments/:treatmentId`

- Appointments: [server/src/routes/appointments.js](/mnt/d/dental-record-system/server/src/routes/appointments.js)
  - `GET /api/appointments/:appointmentId`
  - `PATCH /api/appointments/:appointmentId`
  - `PATCH /api/appointments/:appointmentId/status`

- Attachments: [server/src/routes/attachments.js](/mnt/d/dental-record-system/server/src/routes/attachments.js)
  - `POST /api/attachments`
  - `GET /api/attachments/treatments/:treatmentId`
  - `GET /api/attachments/:id/download`
  - `DELETE /api/attachments/:id`

- Dashboard: [server/src/routes/dashboard.js](/mnt/d/dental-record-system/server/src/routes/dashboard.js)
  - `GET /api/dashboard/summary`
  - `GET /api/dashboard/schedule`
  - `GET /api/dashboard/schedule-by-date`

- Exports: [server/src/routes/exports.js](/mnt/d/dental-record-system/server/src/routes/exports.js)
  - `GET /api/export/patients`
  - `GET /api/export/treatments`
  - `GET /api/export/patients/:patientId/full-record`
  - `GET /api/export/patients/:patientId/treatments`

- Backup: [server/src/routes/backup.js](/mnt/d/dental-record-system/server/src/routes/backup.js)
  - `GET /api/backup/status`
  - `POST /api/backup`

- Runtime: [server/src/routes/runtime.js](/mnt/d/dental-record-system/server/src/routes/runtime.js)
  - `GET /api/runtime/status`

Current service layer:

- `patientService.js`
- `treatmentService.js`
- `appointmentService.js`
- `attachmentService.js`
- `dashboardService.js`
- `exportService.js`
- `backupService.js`
- `idService.js`

Current data access is direct SQLite access from service modules through [server/src/db/database.js](/mnt/d/dental-record-system/server/src/db/database.js). There is no repository abstraction, transaction orchestration layer, or migration framework.

Current validation is centralized in [server/src/utils/validation.js](/mnt/d/dental-record-system/server/src/utils/validation.js), with:

- `validatePatientPayload`
- `validateTreatmentPayload`
- `validateAppointmentPayload`

Current attachment upload/storage logic is centralized in [server/src/utils/attachmentUtils.js](/mnt/d/dental-record-system/server/src/utils/attachmentUtils.js), built on `multer.diskStorage`.

### Assumptions and unanswered questions

- This audit did not exercise live HTTP requests. Route behavior findings are based on mounted code paths and service calls.

## 5. Current SQLite schema and relationships

### Verified findings

The SQLite schema is created in [server/src/db/database.js](/mnt/d/dental-record-system/server/src/db/database.js) by `initializeDatabase()`.

Current tables:

- `patients`
- `treatments`
- `appointments`
- `attachments`

Current relationships:

- `treatments.patient_id -> patients.patient_id`
- `appointments.patient_id -> patients.patient_id`
- `attachments.patient_id -> patients.patient_id`
- `attachments.treatment_id -> treatments.treatment_id`

Current schema characteristics:

- Uses `INTEGER PRIMARY KEY AUTOINCREMENT` internal row IDs.
- Uses human-readable business IDs:
  - `patients.patient_id`
  - `treatments.treatment_id`
- Stores branch as free text: `patients.branch_location`
- Stores treatment financials directly on the treatment row:
  - `amount_charged`
  - `discount_type`
  - `discount_percent`
  - `discount_amount`
  - `net_amount_due`
  - `amount_paid`
  - `balance`
- Stores appointment state directly on the appointment row:
  - `appointment_date`
  - `appointment_time`
  - `planned_procedure`
  - `notes`
  - `status`
- Stores attachment metadata directly in the attachment row:
  - `patient_id`
  - `treatment_id`
  - `attachment_type`
  - `original_filename`
  - `stored_filename`
  - `file_path`
  - `mime_type`
  - `file_size`
  - `uploaded_at`

Important missing V2 schema surfaces:

- `users`
- `roles`
- `permissions`
- `user_roles`
- `patient_accounts`
- `branches`
- `appointment_history`
- `audit_events`
- `notifications`
- `backup_records`
- `support_access_requests`
- invoice/payment/expense/payable tables

Schema evolution is currently handled by `ensureColumn()` in `server/src/db/database.js`, not by committed versioned migrations.

### Assumptions and unanswered questions

- This audit describes the schema bootstrap code, not live row contents.

## 6. Patient and treatment code-generation behavior

### Verified findings

Annual code generation is implemented in [server/src/services/idService.js](/mnt/d/dental-record-system/server/src/services/idService.js):

- `getNextPatientId(date)` generates `P-YYYY-0001`
- `getNextTreatmentId(date)` generates `T-YYYY-0001`

Implementation behavior:

- `buildId(prefix, year, sequence)` pads the sequence to four digits.
- `getNextSequence(prefix, year, tableName, columnName)` queries the latest matching code using `LIKE 'P-YYYY-%'` or `LIKE 'T-YYYY-%'`, sorts descending, and increments the numeric suffix.
- If no row exists for the year, the sequence starts at `1`.

Preserved behavior:

- Annual reset behavior is present by virtue of the year-scoped prefix match.
- IDs are exposed through:
  - `GET /api/patients/next-id`
  - `GET /api/treatments/next-id`

V2 gap:

- The implementation uses a read-latest-then-increment strategy, not the transaction-safe yearly counter strategy required by `README.md`.

### Assumptions and unanswered questions

- Concurrent code-generation collision risk is inferred from the current algorithm; this audit did not run concurrency tests.

## 7. Discount, payment, balance, appointment, attachment, export, and backup behavior

### Verified findings

Discount, payment, and balance behavior:

- Treatment validation and calculations are implemented in `validateTreatmentPayload` in [server/src/utils/validation.js](/mnt/d/dental-record-system/server/src/utils/validation.js).
- Supported discount types are:
  - `None`
  - `Senior Citizen`
  - `PWD`
  - `Senior Citizen/PWD`
  - `Custom`
- Default discount percent behavior:
  - `Senior Citizen`: `20`
  - `PWD`: `20`
  - `Senior Citizen/PWD`: `20`
  - `None`: `0`
- `discount_amount`, `net_amount_due`, and `balance` are recomputed server-side.
- `amount_paid` cannot exceed `net_amount_due`.

Current financial limitation:

- There is no invoice/payment ledger. Financial state exists only as treatment-level fields inside the `treatments` table and service logic.

Appointment behavior:

- Patient-scoped appointment creation is in `POST /api/patients/:patientId/appointments`.
- Appointment edit and status update are in `PATCH /api/appointments/:appointmentId` and `PATCH /api/appointments/:appointmentId/status`.
- Allowed statuses are currently limited to:
  - `Scheduled`
  - `Completed`
  - `Cancelled`
  - `No-show`
- Blank procedure display defaults and blank time display behavior are handled in dashboard/client formatting logic rather than a broader appointment-history model.
- Dashboard schedule logic in [server/src/services/dashboardService.js](/mnt/d/dental-record-system/server/src/services/dashboardService.js) includes:
  - only appointments with status `Scheduled`
  - treatment follow-ups from `next_appointment_date` or `next_appointment`

Current appointment limitations:

- No request/confirmation/reschedule workflow
- No appointment-history table
- No availability check
- No double-booking prevention
- No explicit past-date rejection in appointment validation

Attachment behavior:

- Uploads use `multer.diskStorage` to local folders under `uploads/`.
- Current allowlist covers:
  - `jpg`
  - `jpeg`
  - `png`
  - `webp`
  - `pdf`
  - `doc`
  - `docx`
  - `txt`
- Current max file size is 20 MB.
- Attachment category is required by route validation flow.
- Patient attachments and treatment attachments are stored separately by path.
- Downloads are served from local filesystem paths.
- Deletes remove both the file and database row.

Current attachment limitations:

- Public static `/uploads` exposure
- Local storage only
- No signed URLs
- No file-signature or malware validation
- No audit trail

Export behavior:

- Excel export is implemented in [server/src/services/exportService.js](/mnt/d/dental-record-system/server/src/services/exportService.js) using `exceljs`.
- Current export surfaces include:
  - all patients
  - all treatments
  - full patient record workbook
  - patient treatment workbook
- Current export content includes patient, treatment, financial, and attachment metadata.
- Attachments may be represented with `file:///` links to local files.
- Export files are written to the local `exports/` directory before download.

Backup behavior:

- Backup creation is implemented by `createSystemBackup()` in [server/src/services/backupService.js](/mnt/d/dental-record-system/server/src/services/backupService.js).
- Current backup scope includes:
  - database files from `data/`
  - uploads from `uploads/`
  - exports when present
- Backup status is exposed through `GET /api/backup/status`.
- Manual backup creation is exposed through `POST /api/backup`.
- Automatic weekly backup scheduling is started in [server/src/index.js](/mnt/d/dental-record-system/server/src/index.js).

Current backup limitations:

- No restore endpoint
- No Clinic Administrator approval workflow
- No System Administrator MFA/reauthentication workflow
- No audit trail
- Still local-filesystem based

### Assumptions and unanswered questions

- The current backup service appears to include quick verification logic, but this audit did not execute or inspect actual backup archives.

## 8. Existing tests and missing regression-test coverage

### Verified findings

Current automated tests are limited to two files:

- [server/src/services/dashboardService.test.js](/mnt/d/dental-record-system/server/src/services/dashboardService.test.js)
- [client/src/lib/backupUi.test.js](/mnt/d/dental-record-system/client/src/lib/backupUi.test.js)

What is currently covered:

- Dashboard schedule filtering logic
- Follow-up schedule inclusion logic
- Manila-local date handling for dashboard behavior
- Backup UI display/helper behavior

What is not currently covered but is required by `README.md` and `AGENTS.md`:

- Patient annual code generation and yearly reset
- Treatment annual code generation and yearly reset
- Patient search regression behavior
- Future-date rejection for patient registration, birthday, and treatment dates
- Senior/PWD discount rule preservation
- Balance, discount amount, and overpayment validation
- Appointment create/edit/status/history behavior
- Blank procedure and blank time appointment display rules
- Attachment type restrictions and 20 MB file-size enforcement
- Export content and follow-up field coverage
- Backup creation, inclusion, verification, and retention behavior
- Authentication and authorization behavior
- Role matrix, patient isolation, and branch isolation

Current script gap:

- No root, client, or server `test`, `lint`, `typecheck`, integration, or e2e scripts are defined in the current `package.json` files.

### Assumptions and unanswered questions

- `node --test` is a workable manual runner for the existing `node:test` files, but it is not currently encoded as a project script.

## 9. Security and privacy risks

### Verified findings

Critical risks:

- No authentication or authorization on protected routes.
- No patient isolation, role checks, or branch checks.
- Public static `/uploads` exposure for patient/treatment attachments.
- Unauthenticated exports of sensitive patient and treatment data.
- Unauthenticated backup creation that copies sensitive runtime artifacts.
- No append-only audit trail for reads or writes.

High risks:

- Patient search/list/detail return broad medical and personal data using `SELECT *`.
- Exports embed local `file:///` attachment hyperlinks.
- Local runtime artifacts remain present under `data/`, `uploads/`, `exports/`, and `backups/`.

Medium risks:

- Attachment validation trusts extension and browser MIME type only.
- Localhost-only API assumptions and direct file URLs are hard-coded in the client.
- Logging is unstructured and may disclose internal runtime paths.

### Assumptions and unanswered questions

- This audit did not inspect runtime data contents, only code paths and artifact presence.

## 10. Differences between the existing implementation and the approved V2 README

### Verified findings

Current implementation differs from the approved V2 README in these major ways:

- SQLite instead of PostgreSQL
- integer autoincrement IDs instead of UUIDs
- local upload folders instead of private object storage
- public `/uploads` static serving instead of signed/private file access
- no authentication or role system
- no `Patient`, `Personnel`, `Dentist`, `Clinic Administrator`, `System Administrator` role model in code
- no audit events table or audit middleware
- no patient portal
- no appointment request/confirmation/reschedule/full-calendar workflow
- no invoice/payment/expense/payable/daily-closing finance module
- no normalized `branches` table
- no migration framework
- no repository/service/controller layering matching the V2 target structure
- no staging/production environment separation in code structure
- no test stack matching the V2 toolchain

At the same time, the repository still preserves several V1 business behaviors that V2 explicitly says must survive migration:

- patient code format and reset behavior
- treatment code format and reset behavior
- current Senior/PWD single-20% rule
- dashboard scheduled-appointments-only behavior
- attachment category workflow
- print/PDF/export workflows
- backup inclusion of database and attachments

## 11. Items that must be preserved

### Verified findings

The following current behaviors should be preserved during V2 migration:

- Annual patient code generation: `getNextPatientId` in `server/src/services/idService.js`
- Annual treatment code generation: `getNextTreatmentId` in `server/src/services/idService.js`
- Patient search by name, code, and mobile number: `searchPatients` in `server/src/services/patientService.js`
- Treatment future-date rejection and follow-up date/time rules: `validateTreatmentPayload` in `server/src/utils/validation.js`
- Senior/PWD discount defaults and single-20% basis: `validateTreatmentPayload` in `server/src/utils/validation.js`, client mirror in `client/src/lib/validation.js`
- Treatment financial field calculations: `discount_amount`, `net_amount_due`, `balance`
- Current appointment history preservation by status mutation rather than replacement
- Dashboard schedule rule that only `Scheduled` appointments appear, while follow-ups also appear from treatment data: `getScheduleRows` in `server/src/services/dashboardService.js`
- Birthday reminder handling as plain Manila dates: `getBirthdayReminders` in `server/src/services/dashboardService.js`
- Attachment categories, 20 MB size limit, and patient/treatment attachment separation: `server/src/utils/attachmentUtils.js`
- Print/PDF/Excel export outputs as user-facing workflows: `client/src/pages/Print*.jsx`, `server/src/services/exportService.js`
- Backup inclusion of database, uploads, and exports: `server/src/services/backupService.js`

## 12. Items that must be replaced

### Verified findings

The following implementations should be replaced to reach the approved V2 target:

- `node:sqlite` database usage in `server/src/db/database.js`
- local runtime dependency on `data/dental.db`
- local upload storage in `uploads/`
- public `/uploads` static route in `server/src/app.js`
- hard-coded localhost API/export/upload URLs in `client/src/lib/api.js`
- localhost-only CORS allowlist in `server/src/app.js`
- direct route-to-service-to-SQL pattern without auth/audit/repository layers
- free-text `branch_location` instead of normalized branch references
- treatment-row financial storage as the only accounting model
- unauthenticated export routes in `server/src/routes/exports.js`
- local export file persistence in `server/src/services/exportService.js`
- unauthenticated backup trigger in `server/src/routes/backup.js`
- local backup-first runtime model in `server/src/services/backupService.js`
- lack of users/roles/audit/support-access schema in `server/src/db/database.js`
- lack of migration framework and environment templates at repo root

## 13. Recommended implementation order

### Verified findings

Based on the current repository shape and the approved V2 README, the lowest-risk replacement order is:

1. Establish test baseline for preserved business rules before infrastructure replacement.
2. Add PostgreSQL foundation, migration framework, UUID strategy, and normalized schema while preserving business IDs.
3. Add authentication, role/permission model, branch model, and backend authorization middleware.
4. Add append-only audit infrastructure and request identifiers.
5. Replace local attachment handling with private object storage and signed access.
6. Replace unauthenticated exports with authorized, audited export workflows.
7. Replace local-only backup/restore flow with V2 approval, audit, and recovery controls.
8. Redesign appointments for request/confirmation/reschedule/conflict-safe workflows.
9. Add finance ledger modules for invoices, payments, receivables, expenses, payables, and daily closing.
10. Add patient portal and patient-visible publication controls.
11. Finish environment separation, deployment configuration, monitoring, and production readiness checks.

This order preserves the current system as a behavior reference while removing the highest-risk gaps first.

## 14. Open clinic decisions and unanswered questions

### Verified findings

`README.md` explicitly leaves these decisions open or partially defined:

- Cancellation cutoff policy for appointments
- Whether `DOC`, `DOCX`, and `TXT` should remain allowed in production attachment policy
- Privacy notice, data-retention rules, backup-retention rules, and governance approvals
- Accountant-defined chart of accounts, tax classifications, closing rules, and formal accounting scope

### Assumptions and unanswered questions

- This audit did not verify whether the clinic has already made these decisions outside the repository.
- It is still unclear whether any current local runtime artifacts contain real patient data; the audit intentionally did not inspect their contents.

## 15. Evidence appendix with file references

### Core repository and startup

- [package.json](/mnt/d/dental-record-system/package.json)
- [client/package.json](/mnt/d/dental-record-system/client/package.json)
- [server/package.json](/mnt/d/dental-record-system/server/package.json)
- [client/src/main.jsx](/mnt/d/dental-record-system/client/src/main.jsx)
- [client/src/App.jsx](/mnt/d/dental-record-system/client/src/App.jsx)
- [server/src/index.js](/mnt/d/dental-record-system/server/src/index.js)
- [server/src/app.js](/mnt/d/dental-record-system/server/src/app.js)
- [server/src/config/runtimeConfig.js](/mnt/d/dental-record-system/server/src/config/runtimeConfig.js)

### Database and service layer

- [server/src/db/database.js](/mnt/d/dental-record-system/server/src/db/database.js)
- [server/src/services/idService.js](/mnt/d/dental-record-system/server/src/services/idService.js)
- [server/src/services/patientService.js](/mnt/d/dental-record-system/server/src/services/patientService.js)
- [server/src/services/treatmentService.js](/mnt/d/dental-record-system/server/src/services/treatmentService.js)
- [server/src/services/appointmentService.js](/mnt/d/dental-record-system/server/src/services/appointmentService.js)
- [server/src/services/attachmentService.js](/mnt/d/dental-record-system/server/src/services/attachmentService.js)
- [server/src/services/dashboardService.js](/mnt/d/dental-record-system/server/src/services/dashboardService.js)
- [server/src/services/exportService.js](/mnt/d/dental-record-system/server/src/services/exportService.js)
- [server/src/services/backupService.js](/mnt/d/dental-record-system/server/src/services/backupService.js)

### Routes

- [server/src/routes/patients.js](/mnt/d/dental-record-system/server/src/routes/patients.js)
- [server/src/routes/treatments.js](/mnt/d/dental-record-system/server/src/routes/treatments.js)
- [server/src/routes/appointments.js](/mnt/d/dental-record-system/server/src/routes/appointments.js)
- [server/src/routes/attachments.js](/mnt/d/dental-record-system/server/src/routes/attachments.js)
- [server/src/routes/dashboard.js](/mnt/d/dental-record-system/server/src/routes/dashboard.js)
- [server/src/routes/exports.js](/mnt/d/dental-record-system/server/src/routes/exports.js)
- [server/src/routes/backup.js](/mnt/d/dental-record-system/server/src/routes/backup.js)
- [server/src/routes/runtime.js](/mnt/d/dental-record-system/server/src/routes/runtime.js)

### Validation, attachments, and frontend workflow helpers

- [server/src/utils/validation.js](/mnt/d/dental-record-system/server/src/utils/validation.js)
- [server/src/utils/attachmentUtils.js](/mnt/d/dental-record-system/server/src/utils/attachmentUtils.js)
- [server/src/utils/patientUtils.js](/mnt/d/dental-record-system/server/src/utils/patientUtils.js)
- [client/src/lib/api.js](/mnt/d/dental-record-system/client/src/lib/api.js)
- [client/src/lib/forms.js](/mnt/d/dental-record-system/client/src/lib/forms.js)
- [client/src/lib/validation.js](/mnt/d/dental-record-system/client/src/lib/validation.js)
- [client/src/lib/attachments.js](/mnt/d/dental-record-system/client/src/lib/attachments.js)
- [client/src/lib/pdf.js](/mnt/d/dental-record-system/client/src/lib/pdf.js)
- [client/src/lib/backupUi.js](/mnt/d/dental-record-system/client/src/lib/backupUi.js)
- [client/src/components/Layout.jsx](/mnt/d/dental-record-system/client/src/components/Layout.jsx)
- [client/src/components/AttachmentUploadForm.jsx](/mnt/d/dental-record-system/client/src/components/AttachmentUploadForm.jsx)
- [client/src/components/AttachmentGallery.jsx](/mnt/d/dental-record-system/client/src/components/AttachmentGallery.jsx)
- [client/src/components/PatientAppointmentsTable.jsx](/mnt/d/dental-record-system/client/src/components/PatientAppointmentsTable.jsx)

### Tests and scripts

- [server/src/services/dashboardService.test.js](/mnt/d/dental-record-system/server/src/services/dashboardService.test.js)
- [client/src/lib/backupUi.test.js](/mnt/d/dental-record-system/client/src/lib/backupUi.test.js)
- [server/scripts/createManualBackup.js](/mnt/d/dental-record-system/server/scripts/createManualBackup.js)
- [server/scripts/demoPrepare.js](/mnt/d/dental-record-system/server/scripts/demoPrepare.js)
- [server/scripts/devDemo.js](/mnt/d/dental-record-system/server/scripts/devDemo.js)
- [server/scripts/demoReset.js](/mnt/d/dental-record-system/server/scripts/demoReset.js)
- [server/scripts/demoCleanup.js](/mnt/d/dental-record-system/server/scripts/demoCleanup.js)

### Runtime artifact references

- [data/dental.db](/mnt/d/dental-record-system/data/dental.db)
- [data/dental.db-shm](/mnt/d/dental-record-system/data/dental.db-shm)
- [data/dental.db-wal](/mnt/d/dental-record-system/data/dental.db-wal)
- [uploads/patients](/mnt/d/dental-record-system/uploads/patients)
- [uploads/treatments](/mnt/d/dental-record-system/uploads/treatments)
- [backups/backup_2026-08-06_13-54-09-717_ae4d71](/mnt/d/dental-record-system/backups/backup_2026-08-06_13-54-09-717_ae4d71)
