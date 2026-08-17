# Decision Storage Rules

Use these rules after a grilling session to determine where approved decisions belong.

## Product Requirements

Store in:

`docs/product/PRD.md`

Use for decisions about:

- what the system must do;
- user capabilities;
- role capabilities;
- workflows;
- business rules;
- patient-visible behavior;
- clinic-visible behavior;
- feature requirements;
- acceptance requirements;
- user-facing restrictions.

Examples:

- Patients may only see explicitly published treatment records.
- Personnel may view clinical records but not internal dentist notes by default.
- Only authorized clinic staff may finalize treatment records.
- Patients may request appointments but cannot directly alter completed treatment records.

---

## Architecture / Technical Decisions

Store as Architecture Decision Records under:

`docs/architecture/decisions/`

Use for decisions about:

- database architecture;
- identifiers and keys;
- PostgreSQL design;
- authentication architecture;
- object storage;
- deployment architecture;
- transaction design;
- concurrency strategy;
- audit architecture;
- backup architecture;
- integration patterns.

Examples:

- Use UUID primary keys.
- Keep readable patient codes separate from UUIDs.
- Use PostgreSQL for V2.
- Store attachments in private object storage.
- Use append-only audit events.

Create a new ADR when the decision is significant enough that a future developer would reasonably ask:

"Why was the system designed this way?"

---

## Project / Process Decisions

Normally store in an existing appropriate document.

Examples:

`README.md`
- roadmap;
- technology baseline;
- development architecture.

`AGENTS.md`
- Codex operating rules;
- testing requirements;
- Git restrictions;
- subagent behavior.

Do not create unnecessary documents for minor process decisions.

---

## Unresolved Decisions

Store in:

`docs/product/OPEN-DECISIONS.md`

Use when:

- the user has not chosen an option;
- information is missing;
- a decision depends on future research;
- a stakeholder must approve it;
- the choice is intentionally deferred.

Do not present unresolved decisions as requirements.

---

## Storage Workflow

At the end of grilling:

1. Produce the Decision Register.
2. Classify each decision.
3. Show its proposed destination.
4. Ask the user for approval.
5. Only after approval, update documentation.
6. Do not modify application source code.
7. Do not start implementation automatically.