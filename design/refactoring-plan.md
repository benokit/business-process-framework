# Refactoring plan

The open work on the framework, in order. The reasoning behind each step is in [critique.md](critique.md) (F*, Q*); the goals ([project-goals.md](project-goals.md), G*) and postulates ([postulates.md](postulates.md), P*) are the constraints. This file owns the *order and scope of work*. IDs are stable; done steps are removed (the last version with them is commit `2ccf8a3`).

Status: **draft** (not yet discussed) · **agreed** · **in progress**.

## Principles

- Each step leaves the system working, with its tests passing.
- A step that depends on an open question (Q*) waits until that question is decided.
- The [programming rules](../.claude/skills/programming-rules/SKILL.md) apply to all code.

---

## Core: pure side

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R3.2 | Checked pure functions: arguments and results checked against the `signature`; declared `examples` run in `validate()` | F11 | A wrong argument or result fails; a failing example is reported | draft |
| R3.3 | Purity checks: frozen inputs, a lint configuration for pure modules, a determinism test | F11 | CI runs these checks for every pure function | draft |

## Packages, tooling and delivery

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R4.11 | CI: install, lint, every package's tests and `bpf validate` on the demo, with PostgreSQL, NATS and Meilisearch as services | G6 | A push runs the checks and reports failures | draft |
| R4.13 | Decide how to split pipelines: orchestration as data, computation as mappings or pure functions | F12, G10 | A decision is recorded in the critique | draft |
| R8.1 | The server loads the modules the application declares in its `package.json` (and what they depend on), resolved from the application's root | F43 | An application outside the monorepo starts with the packages it declares, and only those | draft |
| R8.2 | `bpf start [--watch]`: start an application from its root; `--watch` reboots when an element file changes | F43 | The demo runs with `bpf start`, and an edited `.eson` file takes effect without a manual restart | draft |
| R8.3 | Releases: every package at one version, internal dependencies pinned to it, published to GitHub Packages by a release workflow after CI passes | F43, R4.11 | Publishing a version tag makes every package installable from the registry at that version | draft |
| R8.4 | Scaffold `create-business-framework`: `package.json` with the chosen adapters, `elements/`, compose services, a Dockerfile, agent instructions | F43 | A scaffolded application validates, starts against its compose services and builds an image | draft |
| R8.5 | A start fails when a migration is pending (migrations are applied by `bpf migrate`) | F43 | A start against an outdated database fails, naming the pending migrations | draft |
| R8.6 | Liveness and readiness endpoints | F43 | An orchestrator can tell a starting or stopping server from a ready one | draft |

## Entities

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R6.18 | A state model naming an operation the entity type doesn't expose (those declared with `exposes` included) is reported by the states trait's `validate()`; a guard reading `after` on a `delete` is reported (`unknown-path`, the change is a one-of by `operation`). Not done, by decision: a literal operation name in a pipeline (the `entityOperation: "applyAmendment"` of `propose`, the `invoke` of `apply`) stays unchecked, and `refs` doesn't list uses of an operation | F66 | Renaming an operation listed in a state model is reported; a guard reading `after` on a `delete` is reported | done |
| R6.22 | The reference date `validAt` of F54 as a context key read by `read` as the default of `at` | F54 | A replay with a fixed date reads the version in force on it; without the key nothing changes | draft |
| R6.24 | Exposure of trait operations by the node `exposes` ([entities](../implementation/entity/entities/README.md#traits)): traits declare the input of their operations; `update` moves from `entity-type` to `body-entity-type`; `transition`, `update` and the operations of `versioned-entity-type` are declared with `exposes` and a contract that refers to the trait's input schema; `validate()` reports an `exposes` without the trait, the operation or an exposable operation; `stateful-entity-type` carries `transition` only, `stateful-body-entity-type` adds `update`, `versioned-entity-type` extends the latter; a trait marks its exposable operations instead of the fixed list `initialize`, `derive` | F66 | An entity type without a body, with state, is declared and has no `update`; an `exposes` naming a key without a trait, a trait without the operation or `derive` is reported; `explain` lists the exposed operations with their contracts | in progress |
| R6.25 | `invoke` resolves the reference positions of an operation input after the contract check; the data flow types a body's input with ids only; the explicit resolving in `propose` goes; tests: a nested and an array position, `no-instance`, the body typed with ids | F66 | A body never sees `{ instanceOf }` in an input typed `@ref`; `lambdajson-js` flags a body that treats such a value as anything but an id | done |

## Domain concepts (G1)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R5.1 | Decision table kind | F12 | The demo has a rating or eligibility table | draft |
| R5.3 | Process orchestration outside the core (P14): a process kind built from entity states, message consumers and delayed messages; named steps, waits between pipelines, declared extension points | F12, Q3 | A multi-step demo process with a timer runs end to end; no core change is needed | draft |
| R5.4 | Messaging capabilities for R5.3: delayed delivery and routing a message to its process instance | Q3 | A delayed message arrives after its delay; a process instance receives only its own messages | draft |
