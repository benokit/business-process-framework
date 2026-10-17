# Refactoring plan

Plan for implementing the improvements in [critique.md](critique.md) (A*, F*, Q*). The goals ([project-goals.md](project-goals.md), G*) and postulates ([postulates.md](postulates.md), P*) are the constraints. This file owns the *order and scope of work*; the reasoning behind each step stays in the critique.

Status: **draft** (not yet discussed) · **planned** · **in progress** · **done** · **dropped**.

Last updated: 2026-10-17.

---

## Principles

- Each phase leaves the framework working, with tests passing.
- Fix confirmed bugs before redesigning.
- Build the foundation (phases 1–3) before rebuilding business concepts on it (phase 4+).
- A phase that depends on an open question (Q*) waits until that question is decided.

---

## Phase 0: Fixes that need no design decision

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R0.1 | Reproduce with a test, then fix the `_ctx.entity` leak in `entity.execute` (restore the previous value after the extension call) | A7 | Test: a nested `execute` on another entity leaves the caller's `_ctx.entity` unchanged | draft |
| R0.2 | Validate output schemas, at least in dev/test | A6 | Wrong output from a service fails a test | draft |
| R0.3 | Cache compiled mappings instead of recompiling on every `executeMapping` | — | Each mapping tree is compiled once | draft |
| R0.4 | Fix or remove the dead demo handler and channel | A1 | The demo approval handler runs, or is deleted | draft |
| R0.5 | Wrap the direct `low` calls in `auth.eson` in contracted services | A13, F13 | No `low` call outside a service or effect declaration | draft |
| R0.7 | Factor the 6× middleware-resolution block in `entity-service.eson` into one `entity-middleware-chain` element, called with `call` + `inputMap` | A3, F17 | No copy-pasted resolution blocks | draft |
| R0.8 | Let one middleware declaration target several methods (`"methods": [...]`), replacing the 11 near-duplicate transaction, event and relations middleware elements | A3, F17 | One element per middleware | draft |
| R0.9 | Compile each schema once. Keep `addSchema` at registration (load), validate only through `ajv.getSchema(id)`, which compiles lazily on the first request, and never validate during loading. Give service interface schemas ids (`<service>/<method>/input`) so they're compiled once too. Drop `compactSchemas`. | A14, P7 | No `ajv.compile` calls; each schema is compiled at most once; the workspace validator requests every schema id to report unresolved `$ref`s | draft |
| R0.6 | Extend the workspace validator with reference checks (services, methods, `/ref`, `@schema`, `call`/`getElement` ids) and support for `/data` elements | A10 | The validator reports a typo in any of these | draft |

---

## Phase 1: Effect boundary (P3)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R1.1 | Add a scoped `withContext` combinator; make `next` carry the current `_ctx`; add the `execution-node-wrapper` kind, whose `next` runs the keyword's value in the caller's context | F8 | Bindings are visible only within their subtree; a block sees the enclosing outputs and `#.self`; covered by tests | agreed |
| R1.2 | Migrate every `_ctx` write to `withContext`: `inTransaction` as an `execution-node-wrapper`, JWT user as request middleware, correlation and time at the request root; `_ctx.entity` goes with F18. Then forbid `outputKey: "_ctx"` and freeze `_ctx` for `low` | F8, A7 | No code writes to `_ctx`; the validator rejects such writes | agreed |
| R1.2a | Declared context keys: a schema and an owning package per key; `withContext` checks values, the loader rejects reads of undeclared keys | F8 | A typo in `#._ctx.<key>` is a load error | draft |
| R1.3 | Declare effect node kinds with contracts and an effect class (read / write / external / nondeterministic) | F7 | Every effect node has a declaration the loader checks | draft |
| R1.4 | Enforce: `low` only as the implementation of a declared effect | F13 | The loader rejects any other use | draft |
| R1.5 | Remove `$low` from expressions (it's unused today) | F7 | The runtime no longer supports `$low` | draft |
| R1.6 | Build a test interpreter that runs pipelines with stubbed effects | F6, F7 | At least one entity flow is tested with no database or NATS | draft |
| R1.7 | Typed errors: a code, a message, and data | A8 | Callers and HTTP mapping use the error code, not text | draft |

---

## Phase 2: Pure side (P5)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R2.1 | ~~Expression syntax and compiler~~ | F10 | — | dropped |
| R2.2 | Add `$and` and `$or` to LambdaJSON | F12 | Both short-circuit; covered by tests | draft |
| R2.3 | `pure-function` elements with a JS `implementation`, a `signature` and `examples` | F11 | Callable the same way as expression functions; `verifyPassword` is migrated | draft |
| R2.4 | Purity checks: frozen inputs, a lint config for pure modules, a determinism test, and running `examples` in the validator | F11 | CI runs these checks for every pure function | draft |
| R2.5 | Make expressions see context **data** as read-only, with handles hidden | F8 | Expressions can no longer reach handles | draft |

---

## Phase 3: Load-time composition (F2–F5)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R3.0 | ~~Unify `/data` with LambdaJSON~~ (dropped with F16). Original:  element `data` is literal by default, with code only inside `{ "/eval": tree }`; add a `$ref` primitive in both phases, allow `$func/*` in `/eval`, reject reference cycles, and validate data against the kind's shape after evaluation | F15, F16, Q4 | `/eval` works in `data`; `/merge` and `/literal` are removed; the demo's `construction` is defined through a parameterized pure function | dropped |
| R3.1a | Specify behaviour on kinds: operations with `#.self`, the `invoke` node, lifecycle hooks (`load`/`start`/`stop`), `from-instance` operations, and the native bootstrap set | F18, Q6–Q10, [examples/f18](examples/f18/README.md) | A spec in `design/` has been agreed | draft |
| R3.1b | Move bootstrap special cases into kinds: `on-startup`, `ensureAdminUser`, endpoint and consumer activation | F18 | `bootstrap.js` only loads, then runs `load` and `start` hooks | draft |
| R3.1 | Specify the `kind` element: shape, slots, `extends`, and meaning | F4 | A spec in `design/` has been agreed | draft |
| R3.2 | Add explicit slot fills (target and slot), validated against declared slots | F4, A1, A2 | An undeclared slot or missing target fails at load time | draft |
| R3.3 | Add a load-time expansion phase that produces plain, resolved elements, and a tool that dumps the result | F5 | The expanded workspace can be inspected | draft |
| R3.4 | Replace ordering numbers with declared phases and relations | A9, F4 | No `ordering` integers remain | draft |
| R3.5 | Bootstrap: `kind` as the fixed point with its own `load` hook; redefine `schema`, `service`, `pure-function`, `execution-node-template`, `injection` as kinds; turn `$func`, keywords, injections and slot-fill lookup into lazy views over the registry; default kind `data`; error on undefined kinds | F1, F4, F18, A1, [examples/f18](examples/f18/README.md) | The `switch` in `elements-registry` is gone and the lifecycle driver has no kind-specific code | draft |
| R3.6 | Forbid building programs at run time (`execute` of computed pipelines) outside the core | F5, A5 | The validator flags any such use | draft |

---

## Phase 4: Rebuild framework concepts on the foundation

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R4.1 | Redefine `entity-type` as a kind with slots (business key, relations, guards, reactions, extensions), and remove the duplicated middleware resolution | A3, F4 | `entity-service.eson` has no copy-pasted blocks | draft |
| R4.2 | Implement entity class inheritance through `extends` (schema, states model, slots) | A4 | The demo's `construction` inherits from an `insurance-contract` class | draft |
| R4.3 | Replace generic middleware with typed slots and phases | A9, F4 | The runtime middleware chain builders are removed | draft |
| R4.4 | Decide how to split pipelines: orchestration as data, computation as code/pure functions | F9, F14 | A decision is recorded in the critique | draft |

---

## Phase 5: Domain concepts (G1)

Waits on **Q3** (whether business processes need durable execution).

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R5.1 | Decision table kind | F12 | The demo has a rating or eligibility table | draft |
| R5.2 | Authorization: permission model and enforcement at the effect level | A11, [organisation.txt](organisation.txt) | `_ctx.user` is checked on entity operations | draft |
| R5.3 | Process orchestration: named steps, waits, declared overridable points | F9, Q3 | A multi-step demo process runs end to end | draft |
| R5.4 | Durable execution with a replay interpreter and pure-function versioning | F6, F11, Q3 | A process resumes after a restart | draft |
