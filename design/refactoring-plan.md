# Refactoring plan

Plan for implementing the improvements in [critique.md](critique.md) (A*, F*, Q*). The goals ([project-goals.md](project-goals.md), G*) and postulates ([postulates.md](postulates.md), P*) are the constraints. This file owns the *order and scope of work*; the reasoning behind each step stays in the critique.

Status: **draft** (not yet discussed) · **agreed** · **in progress** · **done** · **dropped**.

Last updated: 2026-10-18 (core started in `implementation-new/core`).

---

## Strategy

- **A new core alongside the old runtime.** The new core is built in `implementation-new/core/`, starting from [examples/f18](examples/f18/README.md) (the bootstrap kinds and `dispatch-sketch.js`). The old `implementation/runtime/` stays untouched and keeps running the existing packages.
- **Packages move one by one** (phase 4) into `implementation-new/`, each as its own package: each package is rewritten onto the core (services become kinds and instances, numbered middleware becomes slot fills, `_ctx` writes become `withContext`), its tests are ported and pass, and then the old version is deleted. The old runtime is deleted with the last package.
- **The kind comes first.** Every later step (context rights, wrappers, slots, lifecycle, validation) is declared on kinds.
- The [programming rules](../.claude/skills/programming-rules/SKILL.md) apply to all new code.

## Principles

- Each step leaves the core working, with its tests passing; each moved package leaves the system working.
- Build the core (phases 1–3) before moving packages onto it (phase 4), and those before domain concepts (phase 5).
- A step that depends on an open question (Q*) waits until that question is decided.
- No fixes in the old runtime unless a moved package needs one in the meantime: its known bugs are acceptance tests for the core instead (R1.4, R4.6).

---

## Phase 1: Kind model and bootstrap (core)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R1.1 | Specify the `kind` element: `extends`, `shape`, `defaults`, `operations` (add-only along the chain, Q7), `slots`, `context`, `lifecycle`; operations invoked through an instance with `#.self`; `kind` as the fixed point; the native bootstrap set | F4, F17, F18, P8–P10, [examples/f18](examples/f18/README.md) | The spec in [examples/f18](examples/f18/README.md) is agreed | agreed |
| R1.2 | Create `implementation-new/core/`: registry, loader (records each element's author), kind resolution (chain, operations, slots, `manages`/`reads`), `kind` with its own `load` hook, `instancesOf` including subkinds; default kind `data`; an undefined kind is an error; `$func`, node keywords and slot fills are lazy views over the registry, with no kind-specific code in the registry or the driver | F1, F4, F18, A1 | The f18 bootstrap kinds load; the registry has no `switch` over kinds | done |
| R1.3 | Schemas and contracts: one AJV instance; schemas added at load and compiled lazily on first use, never during load; contract ids `<owner>/<op>/input\|output`, `<kind>/slots/<slot>`, `<kind>/context/manages`; operation input and output validated on every call | A6, A14, P7 | No `ajv.compile` calls; a wrong output fails a test | done |
| R1.4 | Typed errors: a code, a message and data, used by every check in the core from the start | A8 | No string is thrown in the core | done |
| R1.5 | Lifecycle driver: `load`, `start`, `stop`, hooks along the kind chain from general to specific; start order with the slot-order mechanism (Q8): base order by element id, `after`/`before`, `position: first\|last`, cycles are errors | F18, Q8, A9 | Bootstrap is load then start; a consumer starts after the messaging connection without ordering numbers. Kinds declare `startAfter`/`startBefore` (kind names) and `startPosition` (Q8) | done |
| R1.6 | Slots: declarations on kinds and by other packages (`slot-declaration`, P11), fills of kind `slot-fill` or its subkinds, `$func/slot-values`, order (base order, `after`/`before`, `position`), `one` vs `many` | F4, P11, P12, Q15, Q16, A2 | Fill order is deterministic and independent of load order; covered by tests | done |

---

## Phase 2: Execution and effect boundary (core)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R2.1 | Pipeline executor: node forms (`inputMap`, `outputKey`, `set`, `if`, `switch`, `try`, `forEach`, `invoke`, `execute`, `low`, `return`, `throw`), mappings compiled once and cached, no `$low` in expressions, no construction of programs at run time | A5, F5, F7 | The f18 examples' node forms run; covered by tests | done |
| R2.2 | `middleware` node and native `next`; execution node templates and the `execution-node-wrapper` kind (`next` runs the keyword's value in the caller's context) | P12, F8 | Middleware can act before and after, short-circuit and retry; a wrapper sees the caller's outputs and `#.self` | done |
| R2.3 | Scoped context: `withContext`, `next` carrying the current `_ctx`, empty root, `_ctx` frozen for `low` (P4), `outputKey: "_ctx"` rejected; configuration through `$func/app-config`, time through `clock` | F8, P4 | Bindings are visible only within their subtree; no code can write `_ctx` | done |
| R2.4 | Context rights (P13): `withContext` checks the author's `manages` and the key's schema; mappings and `low` see only their author's keys; one tree of managers per key; read keys optional and managed somewhere | P13, F8 | Binding an unmanaged key fails; code can't see undeclared keys | done |
| R2.5 | Execution tracing in a native execution object, not in `_ctx` | F8 | `_ctx` holds no runtime internals | draft |
| R2.6 | Static validation, levels 1 and 2 (Q18), as `validate()` over the loaded registry, run on demand (CLI, CI, tests), never on start: code found through `@method`/`@mapping` positions in shapes; node structure, references, slot names, `low` resolution, context rights, slot and start order, fill values; add the `@mapping` type | Q18, A10, F5, P13 | A typo in any reference, an unmanaged binding or an undeclared context read is reported; start doesn't run it. Done: kinds, context declarations, shapes, slot fills, fill order; open: checks of code (levels 1 and 2) | in progress |
| R2.7 | Effect declarations with contracts and an effect class (read / write / external / nondeterministic); `low` only as the implementation of a declared effect | F7, F13 | `validate()` rejects any other use of `low` | draft |
| R2.8 | A test interpreter that runs pipelines with stubbed effects | F6, F7 | At least one entity flow is tested with no database or NATS | draft |

---

## Phase 3: Pure side (core)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R3.1 | Add `$and` and `$or` to LambdaJSON | F12 | Both short-circuit; covered by tests | draft |
| R3.2 | `pure-function` elements with a JS `implementation`, a `signature` and `examples` | F11 | Callable the same way as expression functions; `verifyPassword` is migrated | draft |
| R3.3 | Purity checks: frozen inputs, a lint config for pure modules, a determinism test, and running `examples` in `validate()` | F11 | CI runs these checks for every pure function | draft |

---

## Phase 4: Move packages onto the core, one by one

Order follows dependencies. For each package: rewrite its elements onto kinds, port its tests, delete the old version.

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R4.1 | Infrastructure without context: `logging`, `cache`, `sequence-generator`, `postgresql` as singleton kinds (a kind plus one instance holding its configuration) | P10 | Their tests pass on the core | done |
| R4.2 | `transaction`: `transaction-manager` and the `transaction-scope` wrapper kind (`inTransaction`), managing `transaction` | F8, P13, [10](examples/f18/10-scoped-context.eson) | No `_ctx.transaction` writes; nested `inTransaction` joins the enclosing one | done |
| R4.3 | `http-server`: `http-endpoint` kind managing `request`, request middleware as a slot, routes registered by a `start` hook | F18, P13, [01](examples/f18/01-bootstrap-kinds.eson) | An endpoint answers with the request's correlation bound | done |
| R4.4 | Messaging (`messaging-nats`, `transactional-outbox`, `framework/messaging`): the publisher chooses the context it propagates; `message-consumer` kind managing `message`, subscribing in `start` (replaces `startConsumers`) | F8, P13, [11](examples/f18/11-message-consumer.eson) | A consumer's run has the producer's correlation | done |
| R4.5 | `framework/definitions` and `framework/database` onto the core: definitions are dropped (the core owns `schema`, `method`, `any`, `mapping`); `db-access` and `db-driver-interface` are dropped (invoke the database instance); `db-model` becomes the `models` slot of `database`, run in slot order by the database's `start` | F18, P12 | Their tests pass on the core | done |
| R4.6 | Entities: `entity-type` as a kind with slots (business key, guards, interceptors, reactions), events through the outbox, relations as a slot declared by its package; `framework/middleware` and the numbered middleware disappear; the old `_ctx.entity` leak (A7) is an acceptance test | A3, A4, A7, A9, F4, Q6, [02](examples/f18/02-entity-type.eson)–[06](examples/f18/06-entity-relations.eson) | No copy-pasted middleware resolution; no ordering numbers; a nested operation on another entity can't change the caller's context. Split into `entities`, `entity-events`, `entity-relations`, `entities-http` (extension operations over HTTP not exposed yet) | done |
| R4.7 | Entity inheritance through `extends` (schema, states model, slots) | A4, Q5 | The demo's `construction` inherits from an `insurance-contract` kind. Done in the core port: classes are kinds extending `entity-type`, defaults merge (Q11 caveats remain) | done |
| R4.8 | `meilisearch` and entity search: the search index as a data slot | Q16, [08](examples/f18/08-search-index.eson) | Search tests pass on the core. Split into `search` (abstract engine), `meilisearch`, `entity-search`, `entity-search-http` | done |
| R4.9 | Security: `users` (`set-password` on the instance), `authorization-basic` as the `user-scope` wrappers (`authenticated`, `asSystem`); every `low` call in `auth.eson` wrapped in a declared effect | A11, A13, F13, P13, [04](examples/f18/04-users.eson), [07](examples/f18/07-authorization.eson) | No `_ctx.user` writes; authorization tests pass | draft |
| R4.10 | `server`: bootstrap is load then start; `on-startup` and `ensureAdminUser` become kinds or instances; the dead demo handler is fixed or removed | A1, F18 | `bootstrap.js` has no kind-specific code | draft |
| R4.11 | `tools`: `validate-workspace.js` replaced by a CLI around `validate()` | Q18 | CI runs `validate()` | draft |
| R4.12 | Delete `implementation/runtime/` | — | Nothing imports it | draft |
| R4.13 | Decide how to split pipelines: orchestration as data, computation as code or pure functions | F9, F14 | A decision is recorded in the critique | draft |

---

## Phase 5: Domain concepts (G1)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R5.1 | Decision table kind | F12 | The demo has a rating or eligibility table | draft |
| R5.2 | Authorization: permission model and enforcement at the effect level | A11, [organisation.txt](organisation.txt) | The principal is checked on entity operations | draft |
| R5.3 | Process orchestration outside the core (P14): a process kind built from entity states, message consumers and delayed messages; named steps, waits between pipelines, declared overridable points | F9, Q3, P14 | A multi-step demo process with a timer runs end to end; no core change is needed | draft |
| R5.4 | Messaging guarantees that make R5.3 buildable: atomic state change and publish (outbox), stable `messageId` for idempotent consumers, delayed delivery | Q3, P14 | A consumer handles a redelivered message once; a delayed message arrives after its delay | draft |

---

## Dropped or absorbed

The plan was renumbered on 2026-10-18 (kind first, new core alongside). Old ids, for references in the history:

| Old | Now | Note |
|---|---|---|
| R0.1 | R4.6 | The `_ctx.entity` leak becomes an acceptance test of the entity port |
| R0.2, R0.9 | R1.3 | |
| R0.3 | R2.1 | |
| R0.4 | R4.10 | |
| R0.5 | R4.9 | |
| R0.6 | R2.6 | Superseded by `validate()` |
| R0.7, R0.8 | R4.6 | Obsolete: slots replace the middleware resolution |
| R1.1 | R2.2, R2.3 | |
| R1.2 | R4.2, R4.3, R4.9 | Migration of each `_ctx` write happens in its package's port |
| R1.2a | R2.4 | |
| R1.2b | R2.5 | |
| R1.2c | R4.4 | |
| R1.3, R1.4 | R2.7 | |
| R1.5 | R2.1 | |
| R1.6 | R2.8 | |
| R1.7 | R1.4 | |
| R1.8 | R2.6 | |
| R2.1 | — | Dropped with F10: no expression syntax or compiler |
| R2.2–R2.4 | R3.1–R3.3 | |
| R2.5 | — | Dropped: reads are not restricted (P13) |
| R3.0 | — | Dropped with F16 |
| R3.1, R3.1a | R1.1 | |
| R3.1b | R4.10 | |
| R3.2, R3.4 | R1.6, R1.5 | |
| R3.3 | — | Waits on Q4 (expansion); none of the examples needs it |
| R3.5 | R1.2 | |
| R3.6 | R2.1 | |
| R4.1, R4.3 | R4.6 | |
| R4.2 | R4.7 | |
| R4.4 | R4.13 | |
| R5.3a | R5.4 | |
| R5.4 (durable execution in the core) | — | Dropped by P14 |
