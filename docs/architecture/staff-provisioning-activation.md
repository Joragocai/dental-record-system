# V2 Supabase Staff Provisioning and Activation

## Status

Phase 08I connects the Phase 08G pending staff application record to Supabase Auth while preserving the Phase 08H append-only audit trail and the Phase 08E/08F backend authorization boundary.

The Clinic Administrator initiates provisioning through the Express API. The browser never receives the Supabase secret key, and the Clinic Administrator never selects or sees the staff member's permanent password.

## Provisioning Flow

```text
Clinic Administrator
  -> authenticated Express request
  -> active application user
  -> staff_account.create
  -> role_assignment.approve
  -> pending approved PERSONNEL/DENTIST app_user
  -> backend-only Supabase invite
  -> provider user UUID returned
  -> app_users.auth_user_id linked
  -> USER_INVITED audit event
```

The protected route is:

`POST /api/staff-accounts/:userId/invite`

Only pending application users with operational `PERSONNEL` and/or `DENTIST` roles and at least one approved branch are eligible for this routine workflow.

The route is idempotent after successful linkage. When the pending application user already has `auth_user_id`, the backend returns `invitation: "already_sent"` and does not resend the provider invitation.

## Secret-Key Boundary

Server-only configuration:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=replace_with_server_only_secret_key
STAFF_PROVISIONING_REQUEST_TIMEOUT_MS=8000
STAFF_INVITE_REDIRECT_URL=http://localhost:5173/activate-account
```

The secret key is used only by the Express-side Supabase Admin adapter. It is never exposed through `VITE_` variables, API responses, audit metadata, browser bundles, logs, or committed files.

The browser continues to use only:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=replace_with_publishable_key
```

## Provider Boundary

The server uses the Supabase Auth Admin invite endpoint with the configured redirect URL. The provider UUID returned by Supabase is treated only as the authentication identity and is written to `app_users.auth_user_id` after the local account has already been approved by the clinic.

Provider/JWT roles and provider metadata are not interpreted as clinic roles or permissions.

The invitation contains minimal provider metadata with the application-user UUID for diagnostics only. Authorization never trusts that metadata.

## External Side-Effect Safety

The provider invitation must occur before local linkage because the provider generates the UUID. This means the provider call cannot participate in the PostgreSQL transaction.

The safety strategy is:

1. validate the pending local target first;
2. send the provider invitation;
3. transactionally link `auth_user_id` and record `USER_INVITED`;
4. if local linkage/audit fails, attempt best-effort deletion of the newly-created provider user;
5. if cleanup also fails, return a reconciliation-required error and never guess or auto-link an account by email.

A pre-existing/conflicting provider account is treated as a safe conflict. The application does not scan provider users and silently link by matching email because that could attach the wrong identity.

## Activation Flow

The invite redirect points to:

`/activate-account`

Supabase verifies the invite and establishes the browser provider session. The staff member then chooses their own password directly through Supabase Auth.

After the password update succeeds, the browser sends the current bearer token to:

`POST /api/staff-accounts/activate`

This route deliberately requires authentication but does not use the active-application-user middleware because the local account is still `pending` at this point.

The backend:

1. uses the verified provider UUID from `res.locals.auth`;
2. resolves the pending application user by `auth_user_id`;
3. verifies the provider email matches the approved application-user email case-insensitively;
4. transactionally changes the application user from `pending` to `active`;
5. records `USER_ACTIVATED` in the append-only audit trail.

The activation response is only:

```json
{ "activated": true }
```

The client signs out locally after activation and asks the staff member to sign in normally using the password they just created.

Phase 08J reuses this self-activation boundary for the initial owner. Routine invitation remains limited to `PERSONNEL` / `DENTIST`, while self-activation additionally accepts only the exact bootstrap role pair `DENTIST` + `CLINIC_ADMINISTRATOR`. Other privileged or mixed role combinations remain denied.

## Audit Events

Phase 08I records:

- `USER_INVITED` / `SUCCESS`
- `USER_INVITED` / `FAILURE` with a safe internal reason code only
- `USER_ACTIVATED` / `SUCCESS`

Audit metadata never includes email addresses, passwords, bearer tokens, provider response bodies, connection URLs, or Supabase secret keys.

## Current Limits

Phases 08I–08J do not yet provide:

- a Clinic Administrator Users/Staff management UI;
- patient invitations or patient-account linking;
- staff deactivation/recovery lifecycle;
- MFA enforcement;
- invitation resend/reconciliation UI;
- custom production email delivery configuration;
- production Supabase database migration;
- private object storage.

Real invitation delivery must be manually verified against the configured development Supabase project using a controlled test identity before production use.
