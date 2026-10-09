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
