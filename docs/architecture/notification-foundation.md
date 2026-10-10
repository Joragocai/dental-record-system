# Phase 13A Notification Foundation

## Status

Phase 13A is implemented and locally PostgreSQL-validated on the
`refactor/v2-cloud-migration` branch. Migration `0012_notification_foundation.sql`
is applied to the isolated Supabase staging database. No notification route,
appointment hook, email provider, worker, or UI is active in this subphase.

## Scope

Phase 13A establishes only the durable PostgreSQL data model required for
in-app notifications and transactional email delivery. It deliberately does
not send email or change Phase 12 appointment behavior.

The approved initial V2 channels remain:

- in-app notifications;
- transactional email;
- no SMS.

## Tables

### notifications

Each in-app notification belongs to exactly one `app_users` recipient.

The record stores:

- notification UUID;
- recipient application-user UUID;
- category and event type;
- safe title/body text;
- optional source type/source UUID;
- optional branch UUID;
- optional request UUID for correlation;
- unique dedupe key;
- creation timestamp;
- nullable read timestamp.

Indexes support recipient history, unread lookup, request correlation, and
source-event tracing.

### notification_preferences

Preferences are per application user and category. The initial categories are:

- `appointment`
- `account`
- `security`
- `system`

The foundation stores in-app and email preference flags. Later service logic
may treat mandatory security notices more strictly than ordinary preferences.

### email_delivery_logs

This table is both the durable delivery queue and delivery-state log.

A row references exactly one recipient identity:

- an `app_users` UUID; or
- a `patients` UUID.

It never stores a copied recipient email address. Delivery code must resolve
the current authorized address from the referenced record when dispatching.

The table stores:

- event/category/template identifiers;
- optional source and branch references;
- request correlation;
- unique dedupe key;
- delivery state;
- attempt count;
- retry timing;
- processing lease expiry;
- last attempt/sent timestamps;
- safe provider message ID;
- safe internal failure code.

Allowed delivery states are:

- `pending`
- `processing`
- `failed`
- `sent`
- `abandoned`

A `processing` row must have a lease expiry. This makes later workers able to
recover jobs left in progress when a Render process stops or restarts.

A `sent` row must have `sent_at`. Failed/abandoned rows require a safe
internal failure code. Raw provider responses and secrets do not belong in the
database.

## Privacy and security posture

- No SMS fields, tables, provider configuration, or environment variables are
  introduced.
- Notification tables do not duplicate recipient email addresses.
- No clinical or financial payload structure is introduced by the foundation.
- System Administrator receives no clinical notification access merely because
  of the technical role.
- Recipient-owned notification API enforcement is deferred to Phase 13D.
- Patient self-service and patient portal notification ownership remain Phase
  14.
- Supabase Auth invitation/recovery email remains outside this subsystem.

## Failure semantics

The email queue is intentionally separate from the eventual provider call.
Phase 13B may create a durable email intent during/after an important domain
event, while Phase 13C will dispatch it independently.

This preserves the core rule that an email-provider outage must not roll back
an already successful appointment or account operation.

## Validation

Phase 13A PostgreSQL integration coverage verifies:

- migration ordering and checksum discovery;
- notification recipient/read state;
- notification and email dedupe keys;
- preference uniqueness;
- exactly-one email recipient;
- valid delivery state transitions/constraints;
- processing lease requirement;
- retry metadata;
- sent-state timestamp consistency;
- no SMS columns;
- no copied recipient-email column.

The broader PostgreSQL foundation, authorization/access, Batch A/B/C, hosted
staging guards, V1 appointment regressions, typecheck, and client build are
also required to remain green.

## Phase 13B Appointment Notification Integration

Phase 13B integrates the Phase 12 appointment domain with durable patient email intents only. No email provider call is made in the appointment request path.

Current patient-facing event map:

- confirmed -> `APPOINTMENT_CONFIRMED` / `appointment-confirmed`
- rescheduled -> `APPOINTMENT_RESCHEDULED` / `appointment-rescheduled`
- clinic cancelled -> `APPOINTMENT_CANCELLED_BY_CLINIC` / `appointment-cancelled-by-clinic`
- no-show -> `APPOINTMENT_NO_SHOW` / `appointment-no-show`

Confirmed appointments created directly by staff also enqueue the confirmed intent. Internal operational transitions such as check-in, start, and complete do not enqueue patient email intents in this phase.

The durable row stores only patient UUID, appointment UUID, branch UUID, request UUID, event/template identifiers, timestamps, and delivery state. It does not copy the patient email address or appointment notes/procedure details. If the patient has no nonblank email address, no email intent is created.

Dedupe keys include the channel, domain, event, appointment UUID, request UUID, and patient UUID. Repeating the same intent is therefore idempotent.

Patient in-app notification creation remains deferred until Phase 14 establishes a secure patient-to-application-user ownership relationship. Phase 13B must not infer that relationship by matching email, name, phone number, or other profile fields.


## Phase 13C Transactional Email Delivery

Phase 13C adds the provider-neutral delivery engine without selecting or enabling a real email provider.

The implementation includes:

- generic appointment email templates that do not include procedure, notes, diagnosis, financial details, or other unnecessary clinical content;
- a provider contract that accepts a server-only from address, recipient address, subject/text content, and the durable queue dedupe key as a provider idempotency key;
- transactional queue claiming with `FOR UPDATE SKIP LOCKED`;
- one active processing lease per claimed job;
- bounded exponential retry/backoff;
- safe `pending -> processing -> sent/failed/abandoned` state handling;
- recovery of expired processing leases after process restarts;
- optimistic finalization using the current `last_attempt_at` claim timestamp so a stale worker cannot overwrite a newer claim;
- safe internal failure codes only; raw provider response bodies are never persisted;
- recipient email resolution only at dispatch time from the referenced patient/app-user record;
- a bounded non-overlapping worker loop suitable for hosted use once a real provider adapter is approved.

The delivery service treats missing recipient email, unsupported templates, invalid provider message identifiers, and explicitly permanent provider rejection as terminal/abandoned conditions. Retryable provider failures use bounded exponential backoff until the configured maximum attempt count.

The provider adapter is responsible for honoring the supplied idempotency key where the selected provider supports provider-side idempotency. This protects the unavoidable boundary where a provider may accept an email immediately before the application process loses its database connection or restarts.

No provider SDK, provider API key, real sender identity, hosted worker activation, or real-email verification is included yet. By user decision, provider selection/configuration, hosted worker activation, and real-email staging verification are deferred until after Phase 13D and remain separate approval gates. The existing staging `pending` delivery record is intentionally left untouched until a provider is selected and explicitly enabled.


## Phase 13D In-App Notification API / UI

Phase 13D adds the authenticated notification center for application users without introducing broad notification RBAC grants.

Security model:

- authentication is required;
- the backend resolves the active `app_users` record from the authenticated Supabase identity;
- the client never supplies a recipient user UUID;
- list, unread-count, mark-read, and mark-all-read queries always scope by the resolved application-user UUID;
- attempting to mark another user's notification returns the same not-found response as a nonexistent notification;
- no role, branch, Clinic Administrator, or System Administrator grant can broaden notification ownership;
- patient appointment in-app notification creation remains deferred until Phase 14 establishes an explicit patient-to-application-user ownership link.

Protected hosted endpoints:

- `GET /api/notifications?limit=...`
- `GET /api/notifications/unread-count`
- `PATCH /api/notifications/:notificationId/read`
- `POST /api/notifications/read-all`

The HTTP list response intentionally exposes only the notification ID, category, event type, safe title/body, read timestamp, and creation timestamp. Internal request IDs, branch IDs, source IDs, and other correlation metadata stay server-side.

The hosted client adds:

- `/notifications` as a protected Vercel SPA route;
- a responsive notification-history page;
- unread/read visual state;
- mark-read and mark-all-read actions;
- unread-count badges from the appointment and account screens;
- fail-closed client response validation for malformed notification/count/read payloads.

The notification runtime uses a lazy PostgreSQL pool capped at one connection to avoid recreating the staging connection-pressure problem previously addressed in Phase 12.

Phase 13D requires no new migration. Migration 0012 remains the notification schema foundation. Local validation covers recipient isolation, durable read state, route authentication, response minimization, hosted route protection, client API helpers, typecheck/build, and existing regressions.
