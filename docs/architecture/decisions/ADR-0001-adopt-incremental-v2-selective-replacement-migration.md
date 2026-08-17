# ADR-0001: Adopt Incremental V2 Selective Replacement Migration

## Status

Accepted

## Context

The original migration plan emphasized finishing broad JavaScript/JSX to
TypeScript/TSX conversion before beginning major V2 infrastructure work such as
PostgreSQL. That sequencing reduced some typing risk, but the current system
audit and the completed TypeScript batches show that a large portion of the
remaining legacy code is tightly coupled to the current SQLite-first runtime
and will likely be replaced rather than preserved as-is.

The repository now has:

- a committed V1 regression safety net for critical business behavior;
- a working TypeScript foundation with coexistence between JavaScript and
  TypeScript;
- stable shared TypeScript utilities on the client;
- a Batch 5 proof that a backend service can migrate to TypeScript while
  JavaScript routes continue to run through a compatibility bridge.

Batch 5 also showed that some additional route-level TypeScript work would
require prerequisites such as Express declaration typing, even though the
underlying domain logic already has a usable TypeScript path.

Continuing to measure progress by percentage of files converted would create a
high risk of duplicate work across SQLite persistence, route handlers, and
frontend flows that are likely to change again during PostgreSQL,
authentication, storage, and V2 feature-slice work.

## Decision

Adopt an incremental selective-replacement migration strategy for V2.

The project will:

- keep the tested V1 implementation as the active reference until targeted V2
  replacements reach parity;
- stop treating broad JavaScript/JSX elimination as a goal by itself;
- reuse existing TypeScript modules that already fit the V2 direction;
- preserve JavaScript-to-TypeScript compatibility bridges while live runtime
  consumers still depend on them;
- establish PostgreSQL and other V2 foundations without waiting for 100%
  TypeScript conversion of the current V1 application;
- implement new V2 capability in incremental vertical replacement slices;
- retire legacy paths only after parity, runtime, data-migration, and review
  gates are satisfied;
- avoid a big-bang rewrite.

## Reasons

- The current regression baseline is strong enough to protect key business
  rules while the architecture changes incrementally.
- Several migrated helpers and services are already reusable without requiring
  broad route, page, or SQLite conversion first.
- The current codebase contains legacy areas whose structure matches V1
  constraints rather than the approved V2 architecture.
- Vertical replacement slices align better with the approved cloud-ready target
  architecture than extension-only conversion of the remaining V1 stack.

## Alternatives Considered

### 1. Finish 100% JavaScript/JSX to TypeScript/TSX conversion first

Rejected because it would spend significant effort converting SQLite-oriented
runtime paths that are likely to be replaced during later V2 work.

### 2. Full greenfield rewrite

Rejected because it would discard the verified V1 regression baseline and would
raise delivery risk for preserved clinic workflows.

### 3. Selective reuse plus incremental vertical replacement

Accepted because it preserves verified behavior where needed, reuses successful
TypeScript work, and avoids unnecessary rewrites of legacy areas that do not
fit the target V2 architecture.

## Consequences

### Positive

- Progress is measured by working V2 capability and parity, not by TypeScript
  percentage.
- Strong TypeScript modules can be reused immediately where they help the next
  V2 slice.
- PostgreSQL foundation work can begin without waiting for unrelated
  JavaScript/JSX conversion.

### Tradeoffs

- Some JavaScript and mixed JS/TS runtime paths will remain temporarily.
- Compatibility bridges must be tracked carefully until all consumers are
  moved.
- Legacy retirement requires explicit gates and focused review instead of
  opportunistic cleanup.

## Related Requirements

- [README.md](../../../README.md)
- [AGENTS.md](../../../AGENTS.md)
- [current-system-audit.md](../current-system-audit.md)
- [03-TypeScript-Foundation.txt](../../codex-prompts/03-TypeScript-Foundation.txt)
- [04-Vertical-TypeScript-Migration-Batch-5.txt](../../codex-prompts/04-Vertical-TypeScript-Migration-Batch-5.txt)
- [05-V2-Selective-Replacement-Transition.txt](../../codex-prompts/05-V2-Selective-Replacement-Transition.txt)
