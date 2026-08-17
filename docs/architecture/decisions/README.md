# Architecture Decision Records

This directory contains significant architecture and technical decisions for the Dental Record System.

Architecture Decision Records (ADRs) explain:

- the problem or context;
- the decision made;
- important alternatives considered;
- why the chosen direction was selected;
- consequences and tradeoffs.

## Naming

Use:

`ADR-NNNN-short-description.md`

Examples:

- `ADR-0001-use-uuid-primary-keys.md`
- `ADR-0002-use-postgresql-for-v2.md`
- `ADR-0003-use-private-object-storage.md`

Numbers are sequential and are never reused.

## Status

An ADR may use one of these statuses:

- Proposed
- Accepted
- Superseded
- Deprecated

Do not rewrite historical accepted decisions simply because the architecture later changes.

Instead, create a new ADR and mark the old ADR as superseded when appropriate.

## ADR Template

# ADR-NNNN: Decision Title

## Status

Proposed

## Context

Describe the problem and why a decision is necessary.

## Decision

State the chosen architecture decision clearly.

## Reasons

Explain why this direction was chosen.

## Alternatives Considered

Describe important alternatives and why they were not selected.

## Consequences

### Positive

Describe benefits.

### Tradeoffs

Describe costs, risks, or limitations.

## Related Requirements

Reference relevant PRD sections, README sections, migration tasks, or other ADRs.

## Current Decisions

Add ADRs to this section as they are accepted.

| ADR | Decision | Status |
| --- | --- | --- |
| ADR-0001 | TBD | Proposed |