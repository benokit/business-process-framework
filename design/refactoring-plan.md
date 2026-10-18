# Refactoring plan

The open work on the framework, in order. The reasoning behind each step is in [critique.md](critique.md) (F*, Q*); the goals ([project-goals.md](project-goals.md), G*) and postulates ([postulates.md](postulates.md), P*) are the constraints. This file owns the *order and scope of work*. IDs are stable; done steps are removed (the last version with them is commit `2ccf8a3`).

Status: **draft** (not yet discussed) · **agreed** · **in progress**.

## Principles

- Each step leaves the system working, with its tests passing.
- A step that depends on an open question (Q*) waits until that question is decided.
- The [programming rules](../.claude/skills/programming-rules/SKILL.md) apply to all code.

---

## Core: execution and effects

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R2.5 | Execution tracing in a native execution object, beside `_ctx` | F21 | A run's path of nodes, operations and slot fills can be logged; `_ctx` holds no runtime internals | draft |
| R2.6 | Static checks of code, levels 1 and 2, in `validate()`: code found through `@method`/`@mapping` positions in shapes; node structure, literal references (`invoke` targets, `instanceOf` kinds, operations, slot names, `low` modules), context rights | Q18 | A typo in any reference, an unmanaged binding or an undeclared context read is reported; start doesn't run it | in progress |
| R2.7 | Effect declarations with contracts and an effect class (read / write / external / nondeterministic); `low` only as the implementation of a declared effect | F7 | `validate()` rejects any other use of `low` | agreed |
| R2.8 | A test interpreter that runs pipelines with stubbed effects | F7 | At least one entity flow is tested with no database or broker | agreed |

## Core: pure side

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R3.1 | Add `$and` and `$or` to LambdaJSON | F12 | Both short-circuit; covered by tests | draft |
| R3.2 | Checked pure functions: arguments and results checked against the `signature`; declared `examples` run in `validate()`; password verification as a pure function | F11 | A wrong argument or result fails; a failing example is reported | draft |
| R3.3 | Purity checks: frozen inputs, a lint configuration for pure modules, a determinism test | F11 | CI runs these checks for every pure function | draft |

## Packages and tooling

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R4.11 | CI: install, lint, every package's tests and `bpf-validate` on the demo, with PostgreSQL, NATS and Meilisearch as services | Q18 | A push runs the checks and reports failures | draft |
| R4.13 | Decide how to split pipelines: orchestration as data, computation as mappings or pure functions | F9, Q1 | A decision is recorded in the critique | draft |
| R4.14 | Database independence: `transaction`, `transactional-outbox` and `sequence-generator` reach the database through its operations instead of the PostgreSQL pool | Q19 | No package but `postgresql` imports `@business-framework/postgresql` | draft |

## Domain concepts (G1)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R5.1 | Decision table kind | F12 | The demo has a rating or eligibility table | draft |
| R5.2 | Security layer: principal required by default, a permission model enforced at entity operations | F20, [organisation.txt](organisation.txt) | A request without a principal can't read or change entities; `user` records don't leave the server with their password hash | draft |
| R5.3 | Process orchestration outside the core (P14): a process kind built from entity states, message consumers and delayed messages; named steps, waits between pipelines, declared extension points | F9, Q3 | A multi-step demo process with a timer runs end to end; no core change is needed | draft |
| R5.4 | Messaging capabilities for R5.3: delayed delivery and routing a message to its process instance | Q3 | A delayed message arrives after its delay; a process instance receives only its own messages | draft |
