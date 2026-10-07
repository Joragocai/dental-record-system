# Clinic / Branch Operating Model Foundation

## Status

Phase 08K records the approved operating model for the single-clinic, multi-branch V2 system. It extends the existing normalized branch and user-branch foundations without introducing a second clinic/tenant layer or a staff scheduling subsystem.

## Organizational Model

The product currently represents one clinic organization:

```text
Clinic organization
  -> one or more branches
  -> flexible Dentist / Personnel branch memberships
  -> branch-specific operational transactions
```

A separate `clinics` table is intentionally unnecessary for the current product. New branches can be added as additional rows in `branches` without redesigning patient identity, user identity, or transaction relationships.

## Branch Identity

`branches.id` is the internal relationship key.

`branch_code` is a unique short operational identifier.

`branch_name` is the human-readable name presented in the application.

Business records must reference branch UUIDs rather than copying branch names as relationship keys.

## Patients Are Clinic-Wide

A patient belongs to the clinic organization, not permanently to one branch.

The existing `patients.branch_id` column is retained for compatibility and represents the patient's registration/origin branch context. It must not be used to conclude that the patient can only be viewed or treated at that branch.

A patient may therefore be registered at one branch and later receive an appointment or treatment at another branch while keeping one patient record and one longitudinal history.

A future cleanup may rename the compatibility field to make the registration semantics more explicit, but that rename is not required for this foundation and must not be mixed into unrelated protected-route work.

## Staff and Dentist Branch Membership

`user_branches` is a many-to-many membership/authorization structure.

A Dentist or Personnel user may have one or multiple branch assignments. Those assignments mean the user is associated with or allowed to operate at those branches; they do not create a permanent home-branch lock.

Actual schedules may place users together at one branch or separately at different branches. Scheduling itself remains a later appointment/operations concern and is not encoded into `user_branches`.

## Clinic Administrator Scope

Clinic Administrator authority is clinic-wide for the administrative and business capabilities granted to that role.

Those administrative permissions should use clinic/global scope rather than requiring one branch assignment per administrative action.

The Clinic Administrator role alone still does not imply routine clinical access. When the owner is also a Dentist, clinical permissions come from the separate Dentist role. Branch-scoped clinical permissions continue to use the Dentist user's allowed branch memberships unless a later approved clinical policy changes that behavior.

## Transaction Branch Identity

Branch-specific activity records where the activity occurred.

Current foundations:

- Appointments store `appointments.branch_id`.
- Treatments store `treatments.branch_id` beginning with migration `0008_treatment_branch_context.sql`.
- Future invoices, payments, expenses, daily closings, and similar operational records must store their actual `branch_id`.

This separates patient identity from service location.

For example, a patient registered at Branch A may have:

```text
patient registration/origin branch -> Branch A
appointment branch                 -> Branch B
treatment branch                   -> Branch B
future payment branch              -> Branch B
```

without creating another patient record.

## Treatment Migration Compatibility

Legacy V1 treatment rows do not contain a reliable independent treatment branch.

For old development/mock parity migration only, the V2 migration helper inherits the migrated patient's registration/origin branch as a deterministic historical snapshot.

That fallback is not the future business rule. New authenticated V2 treatment creation must provide the actual service branch explicitly.

The legacy free-text `dentists` treatment field is also retained for parity. Authenticated user/dentist linkage belongs in the future protected Treatment vertical slice rather than being guessed during this foundation.

## Deferred Complexity

Phase 08K intentionally does not add:

- a `clinics` table;
- staff shift tables;
- dentist calendars beyond the appointment redesign;
- automatic branch assignment when a new branch is created;
- branch CRUD UI;
- duplicate patients per branch;
- protected Treatment route cutover.

The operating model is designed to support those future workflows without requiring them before real clinic testing shows they are needed.
