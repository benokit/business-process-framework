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
| R6.26 | Trait or slot by who knows whom ([F67](critique.md) point 3): `entity-trait` brings configuration and behaviour and stores a value only if it extends `valued-entity-trait` (which declares `initialize`); the slot `businessKey` becomes the trait `business-key` (`identity: true`, its value in `data` is the record's key, `rule` in its configuration; `keyed-entity-type` fixes it); the hooks `guard` and `react` of a trait (run before the fills of the slots; a guard may only read and trace, checked by `validate()` since the effect bound of a template can't see a dynamic call), the guard of `state` as a hook of the trait, and the kind `trait-container` that holds the folds; the guard of `amendment-ledger` is a hook of the ledger trait; a trait that embeds traits is not built ([entities](../implementation/entity/entities/README.md#traits)) | F67 | `create` takes the key from the trait with `identity`; none or several are reported; the demo and the users service declare their rule in the trait configuration; a trait's guard runs without a fill | done |
| R6.27 | Amendments as lists of trait operations ([entity-amendments](../implementation/entity/entity-amendments/README.md)): the fill gives `apply` and `revert` as `[{ key, operation, input }]` (the body's `amend` and `remove` included, by default when absent), `applyAmendment` and `revertAmendment` write them as one change, `preview` returns their commands, `validate()` checks the items against the entity type's traits and their input schemas and reports an `apply` that changes a trait its `revert` doesn't. The demo cancels a construction contract by an amendment (`cancel` active → cancelled, `reactivate` back, `discard` for draft and issued) | — | A cancellation amendment moves the body and the state in one revision and annuls both; a state that can't move rolls the activation back | done |
| R6.28 | Trait messages ([generators](generators.md#the-general-mechanism-trait-writes)): `trait-container` manages the context key `trait` and binds it while a hook or operation of a trait runs; the operation `deliver` and the node `deliver` (`within: entity-trait`) send a message to a trait of an entity, whose `receive` refuses or returns trait operations that the container applies as one internal change (`change.origin`, no authorization, the state model gating `<trait key>/<message>`, applied at the revision read in the transaction); `validate()` reports a `deliver` outside a trait | F68 | A trait of one entity changes another entity or its own through `deliver` in the transaction of the move; a call from outside a trait is `forbidden`; a state outside the model's list for the message refuses it | done |
| R6.30 | Trait processes ([generators](generators.md#the-general-mechanism-trait-writes)): the private `enter` of `trait-container` runs an operation of a trait as the trait in a transaction; a kind makes it an operation of the entity type with `starts: { key, operation }` (first built as a public `enter` with the trait's `entries`, then revised), gated by the state model by the operation's name | F68, R6.28 | A process of a trait starts from outside through a declared operation and may `deliver` to its entity; an operation no kind declares cannot be reached; a state outside the model's list refuses it | done |
| R6.29 | Generators ([generators](generators.md)): the traits `generator` (declarations `{ type, open?, input?, effects? }` by name) and `generated` (the link, the bindings of moves to effects, the guard on `create`, the `react` that delivers `effect`) with `generate` as a started process (R6.30); `amendment-generator` holds the ledger and the amendment policies; `amendmentTypes`, `amendment-link`, `amendment-ledger`, `applyAmendment`, `revertAmendment` and the context `amending` go; the demo's fills become `traits` fills; the tests that pin today's gaps assert the new guarantees | F68, R6.28, R6.30 | The demo's amendments work as before; `entity-amendments.apply` called with a record, and a call of the effect from outside a trait, are refused; a type other than an amendment generates entities by a declaration | done |
| R6.31 | Generators without hooks ([generators](generators.md#what-simplifying-after-r630-changed-r631)): `deliver`/`receive` become the single primitive `write` (the node `writes`, `origin: { sender, entityOperation }`); `generator-trait` keeps `generate` only, the effects are computed by the `react` of `generated` (and its `preview`); the amendment rules are the trait `amendment-ledger` and the policy fields `key`, `context`, `effects` of the generator configuration fixed by `versioned-entity-type`; `plain-generator-trait`, `amendment-generator-trait`, `admit`, `guardEffect`, `settle`, `effectsOf`, `ownMessage` go | F68, R6.28, R6.29 | The amendment tests pass unchanged apart from the ledger key; a write from outside a trait is `forbidden`; a generator needs no subkind to be written | done |

## Domain concepts (G1)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R5.1 | Decision table kind | F12 | The demo has a rating or eligibility table | draft |
| R5.3 | Process orchestration outside the core (P14): a process kind built from entity states, message consumers and delayed messages; named steps, waits between pipelines, declared extension points | F12, Q3 | A multi-step demo process with a timer runs end to end; no core change is needed | draft |
| R5.4 | Messaging capabilities for R5.3: delayed delivery and routing a message to its process instance | Q3 | A delayed message arrives after its delay; a process instance receives only its own messages | draft |
