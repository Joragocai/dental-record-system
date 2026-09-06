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
3. `user_branches` assignments.

If role or branch validation fails, or any assignment insert fails, the transaction is rolled back. The existing case-insensitive unique email index protects against concurrent duplicate account creation.

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

Phase 08G intentionally does not:

- call the Supabase Admin API;
- add a Supabase service-role key;
- send invitation email;
- link `auth_user_id`;
- activate the account;
- let the Clinic Administrator choose a password;
- implement public signup;
- implement general user editing or deactivation;
- implement audit logging;
- implement MFA/privileged reauthentication;
- implement a frontend Users/Staff page.

## Next Gate

The next staff-account phase should perform backend-only managed-auth provisioning for an already approved pending staff record. That phase must use the proven authorization boundary, keep privileged provider credentials server-only, create/send the managed invitation or activation flow, link the resulting provider UUID to `app_users.auth_user_id`, and preserve the rule that the staff member establishes their own password.

Audit logging and privileged reauthentication remain required before this workflow is considered production-ready for real clinic use.
