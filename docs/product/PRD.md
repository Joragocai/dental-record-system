# Dental Record System V2
## Product Requirements Document

## 1. Purpose

Define the product requirements for V2 of the Dental Record System.

V2 will preserve verified V1 dental-record workflows while introducing secure multi-user access, cloud-ready infrastructure, patient-facing capabilities, stronger auditability, appointment management, and financial tracking.

This document defines product behavior and requirements.

Implementation architecture is documented separately.

---

## 2. Product Goals

V2 should:

- preserve existing patient and treatment records;
- provide secure role-based access;
- improve appointment management;
- support secure clinical attachments;
- provide an appropriate patient portal;
- support clinic financial tracking;
- maintain an auditable history of sensitive actions;
- support reliable backup and recovery;
- provide a responsive interface suitable for clinic workflows.

---

## 3. Non-Goals

Unless explicitly added later, V2 does not initially require:

- SMS notifications;
- multi-clinic SaaS operation;
- public access to patient files;
- unrestricted developer access to clinical records;
- automatic AI diagnosis or treatment decisions.

---

## 4. Users and Roles

The system supports five primary roles.

### 4.1 Patient

Describe allowed patient capabilities.

### 4.2 Personnel

Describe allowed personnel capabilities.

### 4.3 Dentist

Describe dentist capabilities.

### 4.4 Clinic Administrator / Clinic Owner

Describe business and administrative capabilities.

### 4.5 System Administrator / Developer

Describe technical responsibilities and restrictions.

---

## 5. Patient Records

Define:

- patient creation;
- patient information;
- medical/dental history;
- classification;
- attachments;
- access rules;
- record corrections;
- archival behavior.

---

## 6. Treatment Records

Define:

- treatment creation;
- treatment codes;
- procedures;
- tooth information;
- dentist records;
- discounts;
- amount due;
- payments/balance representation;
- follow-up date/time;
- finalization;
- correction behavior;
- patient visibility.

---

## 7. Appointment Management

Define:

- appointment creation;
- scheduling;
- status values;
- completion;
- cancellation;
- no-show;
- follow-up;
- double-booking rules;
- patient requests.

---

## 8. Patient Portal

Define:

- account linking;
- records patients may see;
- treatment publication;
- appointments;
- notifications;
- information patients may change;
- information patients may not change.

---

## 9. Attachments

Define:

- supported clinical attachment categories;
- who may upload;
- who may view;
- patient visibility;
- privacy requirements;
- file restrictions.

Do not specify implementation-specific object-storage APIs here.

---

## 10. Finance

Define:

- invoices;
- treatment charges;
- payments;
- balances;
- receivables;
- refunds;
- expenses;
- payables;
- closing/reconciliation;
- authorized roles.

---

## 11. Notifications

Initial channels:

- in-app notifications;
- transactional email.

SMS is not part of the initial scope.

Define important notification events.

---

## 12. Permissions and Privacy

Document product-level access rules.

Examples:

- Personnel may view clinical information required for clinic work.
- Internal dentist notes are restricted by default.
- Patients may only access records belonging to their linked patient identity.
- System administrators do not receive unrestricted routine clinical access.

Technical authorization implementation belongs in architecture documentation.

---

## 13. Audit Requirements

Define which actions require an auditable history.

Examples:

- record creation;
- record correction;
- privileged access;
- role changes;
- publication of patient-visible records;
- restore approval/execution.

---

## 14. Backup and Recovery Requirements

Define product/business expectations such as:

- clinic information must be recoverable;
- restores require appropriate approval;
- restore activity must be auditable;
- recovery must be periodically tested.

Technical backup implementation belongs in architecture documentation.

---

## 15. Data Migration Requirements

Define what must survive V1 → V2 migration.

Examples:

- patient records;
- treatments;
- appointments;
- readable patient/treatment codes;
- discounts and balances;
- attachment relationships;
- important historical timestamps.

---

## 16. Acceptance Criteria

A feature is acceptable when:

- its approved requirements are implemented;
- backend authorization is enforced where required;
- regression tests protect existing workflows;
- applicable TypeScript/typecheck checks pass;
- applicable integration/e2e tests pass;
- no real patient data is exposed in development/test fixtures.

Add feature-specific acceptance criteria as requirements mature.

---

## 17. Out of Scope

Maintain explicit exclusions here.

---

## 18. Open Decisions

Unresolved requirements are tracked in:

`docs/product/OPEN-DECISIONS.md`

Do not treat open decisions as approved requirements.

---

## 19. Related Architecture Decisions

Technical decisions are recorded in:

`docs/architecture/decisions/`