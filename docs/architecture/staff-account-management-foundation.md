# V2 Staff Account Management Foundation

## Status

Phase 08G adds the first Clinic Administrator-controlled staff account creation workflow. It creates pending application-user records and approved operational role/branch assignments in PostgreSQL. It does **not** provision a Supabase Auth identity yet.

## Security Boundary

The protected route is:

`POST /api/staff-accounts`

Middleware order is:

```text
authenticate
  -> resolve active application user
  -> resolve authorization context
  -> require staff_account.create
  -> require role_assignment.approve
  -> validate/create pending staff account
```

A denied or unauthenticated caller never reaches the staff creation service.

## Request Contract

```json
{
  "displayName": "Fictional Staff",
  "email": "staff@example.test",
  "roles": ["PERSONNEL"],
  "branchIds": ["<branch UUID>"]
}
```

Routine staff creation accepts only these operational roles:

- `PERSONNEL`
- `DENTIST`

The route cannot create or assign:

- `PATIENT`
- `CLINIC_ADMINISTRATOR`
- `SYSTEM_ADMINISTRATOR`

Those identities/privileged assignments require separate future workflows and controls.

## Pending Account Model

Every new staff record is created as:

```text
app_users.status = pending
app_users.auth_user_id = NULL
```

The pending application record can therefore exist before managed-auth provisioning. The Clinic Administrator never supplies or sees the staff member's permanent password.

The service normalizes the email to lowercase, normalizes display-name whitespace, requires at least one approved role and one valid branch, rejects duplicate role/branch inputs, and validates branch UUIDs before starting a database transaction.

## Atomic Database Write

The service creates the following in one PostgreSQL transaction:

1. pending `app_users` row;
2. `user_roles` assignments;
3. `user_branches` assignments;
4. Phase 08H `STAFF_ACCOUNT_CREATED` append-only audit event.

If role or branch validation fails, any assignment insert fails, or the audit insert cannot be recorded safely, the transaction is rolled back. The existing case-insensitive unique email index protects against concurrent duplicate account creation.

## Response Contract

A successful request returns HTTP 201 with only:

```json
{
  "id": "<application-user UUID>",
  "email": "staff@example.test",
  "displayName": "Fictional Staff",
  "status": "pending",
  "roles": ["PERSONNEL"],
  "branchIds": ["<branch UUID>"]
}
```

The response never contains `auth_user_id`, passwords, bearer/access/refresh tokens, service-role credentials, provider metadata, or effective permission lists.

## Runtime Design

The staff-account runtime is lazy. Importing `server/src/app.js` does not require `DATABASE_URL`; PostgreSQL configuration and the staff account service are created only when the protected staff-account route is actually invoked.

Thin JavaScript-to-TypeScript bridge files temporarily preserve the current plain-Node server runtime while new V2 staff/repository/service modules remain TypeScript-first.

## Current Limitations

The combined 08G–08I staff foundation still does not:

- let the Clinic Administrator choose a staff password;
- implement public signup;
- implement general user editing, deactivation, or recovery lifecycle;
- implement MFA/privileged reauthentication;
- implement a frontend Users/Staff management page;
- implement patient invitations or patient-account linking;
- provide automated reconciliation for a provider account that conflicts with an approved pending staff record.

## Phase 08H Audit Integration

Phase 08H now records successful staff-account creation using the trusted actor from `res.locals.applicationUser`, not from the request body. The event records the created application-user target plus safe normalized role/branch metadata. Audit UPDATE and DELETE operations are blocked by PostgreSQL.

## Phase 08I Provisioning and Activation

Phase 08I now performs backend-only Supabase invitation for an already-approved pending staff record, links the returned provider UUID to `app_users.auth_user_id`, and keeps the application account pending until the invited staff member establishes their own password and completes authenticated activation.

The Supabase secret key is server-only. The browser uses only the publishable key. Invite and activation events are written to the append-only audit trail. Provider conflicts are not auto-linked by email.

See `docs/architecture/staff-provisioning-activation.md` for the provider-side-effect and activation details.

## Next Gate

Before real clinic use, the account lifecycle still needs privileged MFA/reauthentication, staff deactivation/recovery controls, production email-delivery review, and a Clinic Administrator management interface. Patient account linking remains a separate security phase.
