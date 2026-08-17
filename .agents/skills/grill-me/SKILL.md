---
name: grill-me
description: Relentlessly question a proposed product, architecture, migration, or major technical plan before implementation. Use when important design decisions, assumptions, risks, tradeoffs, requirements, or unresolved choices need to be surfaced and resolved before creating an implementation plan.
---

# Grill Me

Interrogate the proposed design until all meaningful decision branches have either been resolved or explicitly recorded as unresolved.

Do not implement application code while using this skill.

## Preparation

Before asking questions:

1. Read the repository instructions and relevant documentation.
2. Inspect repository facts that can answer questions without asking the user.
3. Read:
   - `README.md`
   - `AGENTS.md`
   - `docs/product/PRD.md`, when present
   - `docs/product/OPEN-DECISIONS.md`, when present
   - relevant files under `docs/architecture/decisions/`
4. Inspect relevant source code when the question depends on the existing implementation.

Do not ask the user for information that can reasonably be discovered from the repository.

## Build the Decision Tree

Identify the main decisions underlying the proposal.

Group questions into focused rounds rather than asking everything at once.

For each unresolved question provide:

1. **Question**
2. **Why it matters**
3. **Recommended answer**
4. **Alternatives / tradeoffs**

Clearly distinguish:
- repository facts;
- recommendations;
- user-approved decisions;
- unresolved issues.

Never treat your recommended answer as an accepted decision.

## Questioning Strategy

Prioritize questions that can materially affect:

- product behavior;
- users and permissions;
- data integrity;
- security/privacy;
- architecture;
- failure/recovery behavior;
- migration/cutover strategy;
- concurrency;
- maintainability;
- testing;
- deployment;
- future extensibility.

Do not spend time grilling trivial implementation details that can safely be decided during implementation.

## Continue Until Resolved

After each round:

1. Record accepted decisions in the session decision register.
2. Update the unresolved decision tree.
3. Identify new decisions implied by the answers.
4. Continue only while meaningful unresolved branches remain.

Stop when:
- meaningful decisions have been resolved; or
- remaining decisions are explicitly marked unresolved because more information or human approval is required.

## Decision Persistence

Read `references/decision-storage.md`.

Do not modify repository documentation while the grilling discussion is still active.

When grilling is complete:

1. Produce a Decision Register.
2. Assign temporary identifiers:
   - D-001
   - D-002
   - D-003
3. Classify each accepted decision as:
   - PRODUCT REQUIREMENT
   - ARCHITECTURE / TECHNICAL DECISION
   - PROJECT / PROCESS DECISION
4. Classify unanswered decisions as:
   - UNRESOLVED
5. Show the proposed storage destination for each decision.
6. Ask for user approval before updating repository documentation.

Do not modify application source code.

## Completion

Finish with:

### Accepted Decisions
List final approved decisions.

### Rejected Alternatives
List meaningful alternatives rejected during grilling and why.

### Unresolved Decisions
List anything still needing a decision.

### Proposed Documentation Updates
Show which decisions belong in:
- `docs/product/PRD.md`
- `docs/architecture/decisions/`
- `docs/product/OPEN-DECISIONS.md`
- other project documentation when appropriate

### Recommended Next Step
Recommend the next planning step.

Do not begin implementation automatically.