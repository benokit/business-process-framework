# Refactoring plan

The open work on the framework, in order. The reasoning behind each step is in [critique.md](critique.md) (F*, Q*); the goals ([project-goals.md](project-goals.md), G*) and postulates ([postulates.md](postulates.md), P*) are the constraints. This file owns the *order and scope of work*. IDs are stable; done steps are removed (the last version with them is commit `2ccf8a3`).

Status: **draft** (not yet discussed) · **agreed** · **in progress**.

## Principles

- Each step leaves the system working, with its tests passing.
- A step that depends on an open question (Q*) waits until that question is decided.
- The [programming rules](../.claude/skills/programming-rules/SKILL.md) apply to all code.

---

## Security (done)

Security lives at the boundary (P19): each HTTP endpoint maps its request to an operation of plain dimensions, modules grant operations to their actors, the application assigns actors to roles and may grant on a role directly (P20), and a middleware checks the user's roles. Security comes before processes (R5.3) and new domain kinds, so they are built with it instead of retrofitted. The model and its reasons: [authorization](../implementation/services/authorization/README.md). Later, not planned yet: data-level scopes (row filters). Message consumers are out of scope: users don't interact through them (P19).

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R9.1 | The operation representation: the `dimensions` slot of `authorization` (a new package), filled with `area`, `resource` (parents: the kind chain, `$func/kind-chain`) and `action` (parents: the action levels `query`, `command`), each with an optional default mapping and parents; `operation` (a mapping from `{ params, query, headers, input }`, `input` being the mapped target input) or `public` on `http-endpoint`; `actor` elements granting boxes (each dimension a value, an array or `*`, omitted meaning `*`) and `role` elements listing actors; `validate()` reports an endpoint with neither, a role naming an unknown actor, an operation mapping whose result doesn't fit the dimensions, and a dimension whose type isn't a closed set | P19 | A demo endpoint without an operation, a dimension read from a free string, and a grant naming an unknown transition are reported; a grant on an entity class covers the entity types extending it; a fixture adding a fourth dimension keeps existing grants valid | done |
| R9.2 | The authorization middleware: a `requestMiddleware` fill after `authenticate-requests` maps the request to its operation, walks the trie of grants, flattened at load from roles through their actors and expanded through the dimensions' hierarchies, and answers `401` without a principal and `403` without a granting role | R9.1 | A request without a token, or with roles that grant nothing, is refused by every endpoint that isn't public | done |
| R9.3 | Every framework and demo endpoint declares its operation; the framework packages declare their actors (coarse entity actors: `entity-reader-actor`, `entity-editor-actor`, `entity-lifecycle-actor`), the demo declares its domain actors (underwriter, viewer) and its roles; tests call endpoints with tokens | R9.2 | The demo works for the underwriter and refuses the viewer's changes | done |
| R9.4 | Migrations: the `models` slot of `database` becomes `migrations`, fills named by their id holding a `command` or a pipeline (`run`), ordered like every slot; `database.migrate()` runs each one the table `migrations` doesn't record and records it, and `bpf migrate` starts the application, migrates and stops; a start creates nothing, so it no longer runs the whole schema, which is slow and redundant; tests migrate after they start. No principal is bound: authorization is at the boundary, so a migration's entity operations need none | P19 | `bpf migrate` on an empty database creates the tables, a second run applies nothing | done |
| R9.5 | Users are created and changed by administrators only, through the actor `user-administrator`, granting the entity endpoints on `user` (a token no longer creates its user, done); the generic entity actors except `user` (`except` in grants); a migration of the application inserts the user `administrator` with the administrator role; `security.actAs` in the app config maps a login's subject to a user; the administrator and its migration are the application's (`administrator-role` is an application role, P20) | R9.3, R9.4 | `POST` and `PUT` on a user are refused without the administrator role; after `bpf migrate`, a login whose subject `actAs` maps to `administrator` may create users | done |
| R9.6 | Actors and roles per endpoint in the tools: where an endpoint's dimensions are a closed set, `bpf explain` lists the actors granting it and the roles holding them, and a role's operations; `validate()` warns about an endpoint no actor grants and an actor grant that matches no endpoint | R9.2 | `bpf explain` of the transition endpoint lists the underwriter and the roles holding it | done |

## Data composition, `fixed` and settings

The algebra is specified in [data-composition.md](data-composition.md) (P21), the kind values and settings in [kind-settings.md](kind-settings.md) (P22, F48).

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R10.1 | The `/data` operations `replace`, `unset`, `append` and the composition table; arrays stop merging by index; the demo and packages migrated | P21 | `/merge` uses the algebra; the laws hold as property tests | in progress (core done, `core/src/composition.js`; the demo and packages need no migration)
| R10.2 | `fixed` replaces `defaults`: union along the chain with conflicts reported by `validate()`, fill-in of an instance before the shape check; `search`, `database` integrations migrated; `defaults` removed from the `kind` shape | P22, F48 | An instance has the fixed values of its chain; a different value is an error | done (the cache's `maxEntries` default is a `$coalesce` in its `set` until R10.3; an entity class no longer pre-fills `bodySchema`, an instance composes it with `$data#&`) |
| R10.3 | Settings: `settings.shape` and `settings.defaults` on a kind, the layers (defaults, `app-config`, environment) by element id, conversion of environment values by the shape, `$func/settings` with a known type; the env-addressable rules in `validate()`; the cache's `maxEntries` and the existing `app-config` sections migrated to kind ids | P22, F48 | A setting is set by one variable; a bad or missing value fails the start naming the layers | done (the type of `$func/settings` isn't inferred yet: its output is `object`) |
| R10.4 | `bpf explain` lists the settings of a kind or instance (path, type, default, section, variable name, mode values) and its `fixed` values; it doesn't read the environment | P22, F48 | `explain` shows what can be configured | done (without provenance of composed values: settings come in layers by id, listed with their variable) |

## Core: execution and effects

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R2.5 | Execution tracing as an interpreter: `traced` and `bpf trace` | F21, F37 | A run's operations, slot fills, templates, steps and `low` effects can be listed; untraced runs unchanged; `_ctx` holds no runtime internals | done (diagrams open) |
| R2.6 | Failure frames: `runSequence` and `invoke` add `{ node index, phase }` and `element.operation` to an escaping `CoreError`; `low` errors wrapped in `low-failed`; a formatter; HTTP responses without frames | F52 | A failure three operations deep names the route; no frames in a response | done |

## Core: pure side

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R3.2 | Checked pure functions: arguments and results checked against the `signature`; declared `examples` run in `validate()` | F11 | A wrong argument or result fails; a failing example is reported | draft |
| R3.3 | Purity checks: frozen inputs, a lint configuration for pure modules, a determinism test | F11 | CI runs these checks for every pure function | draft |

## Packages and tooling

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R4.11 | CI: install, lint, every package's tests and `bpf validate` on the demo, with PostgreSQL, NATS and Meilisearch as services | G6 | A push runs the checks and reports failures | draft |
| R4.13 | Decide how to split pipelines: orchestration as data, computation as mappings or pure functions | F9, G10 | A decision is recorded in the critique | draft |

## Delivery

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R8.1 | The server loads the modules the application declares in its `package.json` (and what they depend on), resolved from the application's root | F43 | An application outside the monorepo starts with the packages it declares, and only those | draft |
| R8.2 | `bpf start [--watch]`: start an application from its root; `--watch` reboots when an element file changes | F43 | The demo runs with `bpf start`, and an edited `.eson` file takes effect without a manual restart | draft |
| R8.3 | Releases: every package at one version, internal dependencies pinned to it, published to GitHub Packages by a release workflow after CI passes | F43, R4.11 | Publishing a version tag makes every package installable from the registry at that version | draft |
| R8.4 | Scaffold `create-business-framework`: `package.json` with the chosen adapters, `elements/`, compose services for them, a Dockerfile, agent instructions | F43 | A scaffolded application validates, starts against its compose services and builds an image | draft |
| R8.5 | A start that checks the database: migrations are declared and applied by `bpf migrate` (R9.4); a start fails when one is pending | R9.4 | A start against an outdated database fails, naming the pending migrations | draft |
| R8.6 | Liveness and readiness endpoints | F43 | An orchestrator can tell a starting or stopping server from a ready one | draft |

## Entity traits

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R6.5 | Trait assignments with a key: `key` is a parameter of the assignment (default: the trait's id), a trait declares its cardinality (`one` fixes the key); a change, `writeTrait`, the store and events carry the key ([versionable](versionable.md) §5) | F22 | An entity type holds two assignments of one `many` trait under different keys; existing types are unchanged | done |
| R6.3 | Versionable trait: a timeline of segments, the last in full and earlier ones as backward JSON Patch deltas, `put`, `remove`, `resolve` ([versionable](versionable.md)) | F22, R6.5 | A demo entity type keeps a timeline; no table changes | done |
| R6.4 | Reuse a states model through data composition in the demo | F22 | Two entity types share one states model element | draft |
| R6.6 | Trait configuration in the data of the element: `traits` map (key to configuration) in the shape of `entity-type`; the configuration of a `traits` fill becomes optional and the data replaces it per key ([body-trait](body-trait.md) §2) | F22, R6.5 | A trait is configured in the entity type's own data; `validate()` rejects configuration for an undeclared key and names the source of a problem | done |
| R6.7 | `body` as a trait: `body-trait`, declared by a fill on `entity-type`, initialized and registered like any trait ([body-trait](body-trait.md) §3) | F22, R6.6 | `create` has no special case for `body`; done together with R6.8, so no `bodySchema` alias | done |
| R6.8 | Remove `update`, the change operation `update` and `bodySchema`; HTTP and gateway map the body endpoints onto `entity-bodies.put`; tests, demo and READMEs migrated, the "special in structure" sentence of [entities](../implementation/entity/entities/README.md#traits) and F22 updated | F22, R6.7 | `entity-type` names no trait | done |
| R6.9 | Demo trait configurations moved from fills into entity type data; `bpf explain` shows the fills and the effective data | F22, R6.6 | The demo configures its traits in its entity types | done |
| R6.10 | Trait configuration as kind data ([body-trait](body-trait.md) §2): a use is `{ trait?, configuration }`; `entity-type` fixes the shape and `fixed.traits.body`; the effective configuration of a key is the union of the kind chain's `fixed`, the data and the fills, a different value at one path is a conflict; fills require `configuration`; keys introduced only by fills are closed to instance data; `validate()` reports a field both optional and required | F22, R6.9 | `marine` extends the class's state model without `/merge`; a conflict names the contributor and the path; no precedence rule remains | done |

## Row access

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R11.1 | Ownership trait: a kind fixes typed dimensions, the entity type configures a `rule` mapping the record to the ownership; a generic interceptor recomputes it at every write ([row-access](row-access.md) §2, §3) | F22 | An entity type holds an ownership that follows its body (the demo's contracts hold one); a rule reading an unknown path fails `validate()` | done |
| R11.2 | Scopes: the `scope` kind, the filter subset of LambdaJSON, the mapping as the in-memory evaluator and a translator to the search filter ([row-access](row-access.md) §4) | R11.1 | One test runs both evaluators over the same records with equal results | done |
| R11.3 | Access profiles, apart from process permissions: the `access-profile` element (permissions `{ resource, scopes, except }`, included profiles), the `access` list of the user beside `roles`, `rowAccess`; the generic guard on `read` (the `guards` slot extended to it) and writes, a reaction for the record as written, the search filter ([row-access](row-access.md) §1, §5, §6) | R11.2 | A user reads and finds only the records their access profiles reach, whatever their process roles; a hidden record is `not-found`; `list` is gone from the entity type and the HTTP API | done |
| R11.4 | Backfill of ownership when a rule changes, run as a migration, its writes reindexing the search through the entity events; `bpf explain` for scopes and ownership ([row-access](row-access.md) §3, §7) | R11.3 | Changing a rule and migrating makes the stored ownership agree with it | done |
| R11.5 | Scopes see the principal: `{ ownership, principal }`, claims bound as values when the filter of a request is built, an open principal and the optional schema `principal-claims` ([row-access](row-access.md) §4) | R11.3 | One role serves every region through the `region` claim of the user; a missing claim shows nothing | done |
| R11.6 | Process and access permissions as two kinds, assigned separately: grants carry no scopes, the operation isn't in the context, a user holds `roles` and `access`, no profile reaches nothing ([row-access](row-access.md) §1) | R11.3 | One process role serves users of every region; the region comes from the access profile and the user's claim | done |
| R11.7 | Organisational access: the `hierarchy` element (a static tree of department names), `$func/hierarchy-subtree`, and computed principal-side values in scopes ([row-access](row-access.md) §4) | R11.5 | A member of a department reaches the entities of the departments below it, from one department in the ownership | done |

## State permissions

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R12.1 | Permission state: the state dimension named by `permissionDimension` (the only one, otherwise `status`) in the state model, checked by `validate()` ([state-permissions](state-permissions.md) §2, §5) | R11.7 | A model whose permission dimension is undeclared fails `validate()` | done |
| R12.2 | The `state` dimension of `default-authorization`, a closed set registered at load, unknown at the boundary; `authorize-requests` binds `_ctx.operation` ([state-permissions](state-permissions.md) §3, §4) | R12.1 | Permission state: the state dimension named by `permissionDimension` (the only one, otherwise `status`) in the state model, checked by `validate()` ([state-permissions](state-permissions.md) §2, §5) | R11.7 | A model whose permission dimension is undeclared fails `validate()` | done |
| R12.3 | The state guard on `entity-type`: writes and transitions on the record as it is, `create` by a reaction, `forbidden` ([state-permissions](state-permissions.md) §4) | R12.2 | A role granted `command` in `editable` modifies a draft and gets `forbidden` on a locked record, the same role on an ungoverned type is unaffected | done |
| R12.4 | `bpf explain` for the permission states and who may do what in each; the demo's contracts ([state-permissions](state-permissions.md) §5) | R12.3 | The demo has a role that modifies drafts only, and a server test runs it | done |

## Domain concepts (G1)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R5.1 | Decision table kind | F12 | The demo has a rating or eligibility table | draft |
| R5.3 | Process orchestration outside the core (P14): a process kind built from entity states, message consumers and delayed messages; named steps, waits between pipelines, declared extension points | F9, Q3 | A multi-step demo process with a timer runs end to end; no core change is needed | draft |
| R5.4 | Messaging capabilities for R5.3: delayed delivery and routing a message to its process instance | Q3 | A delayed message arrives after its delay; a process instance receives only its own messages | draft |
