# Refactoring plan

The open work on the framework, in order. The reasoning behind each step is in [critique.md](critique.md) (F*, Q*); the goals ([project-goals.md](project-goals.md), G*) and postulates ([postulates.md](postulates.md), P*) are the constraints. This file owns the *order and scope of work*. IDs are stable; done steps are removed (the last version with them is commit `2ccf8a3`).

Status: **draft** (not yet discussed) · **agreed** · **in progress**.

## Principles

- Each step leaves the system working, with its tests passing.
- A step that depends on an open question (Q*) waits until that question is decided.
- The [programming rules](../.claude/skills/programming-rules/SKILL.md) apply to all code.

---

## Security (next)

Security lives at the boundary (P19): each HTTP endpoint maps its request to an operation of plain dimensions, modules grant operations to their actors, the application assigns actors to roles (P20), and a middleware checks the user's roles. Security comes before processes (R5.3) and new domain kinds, so they are built with it instead of retrofitted. The representation is proposed in F20. Later, not planned yet: data-level scopes (row filters), parameterized actors and entry points other than HTTP.

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R9.1 | The operation representation: the `dimensions` slot of `authorization` (a new package), filled with `area`, `resource` (parents: the kind chain, `$func/kind-chain`) and `action` (parents: the action levels `query`, `command`), each with an optional default mapping and parents; `operation` (a mapping from `{ params, query, headers, input }`, `input` being the mapped target input) or `public` on `http-endpoint`; `actor` elements granting boxes (each dimension a value, an array or `*`, omitted meaning `*`) and `role` elements listing actors; `validate()` reports an endpoint with neither, a role naming an unknown actor, an operation mapping whose result doesn't fit the dimensions, and a dimension whose type isn't a closed set | F20, P19 | A demo endpoint without an operation, a dimension read from a free string, and a grant naming an unknown transition are reported; a grant on an entity class covers the entity types extending it; a fixture adding a fourth dimension keeps existing grants valid | done |
| R9.2 | The authorization middleware: a `requestMiddleware` fill after `authenticate-requests` maps the request to its operation, walks the trie of grants, flattened at load from roles through their actors and expanded through the dimensions' hierarchies, and answers `401` without a principal and `403` without a granting role | R9.1 | A request without a token, or with roles that grant nothing, is refused by every endpoint that isn't public | done |
| R9.3 | Every framework and demo endpoint declares its operation; the framework packages declare their actors (coarse entity actors: `entity-reader-actor`, `entity-editor-actor`, `entity-lifecycle-actor`), the demo declares its domain actors (underwriter, viewer) and its roles; tests call endpoints with tokens | R9.2 | The demo works for the underwriter and refuses the viewer's changes | done |
| R9.4 | Migrations: the `models` slot of `database` becomes `migrations`, fills named by their id holding a `command` or a pipeline (`run`), ordered like every slot; `database.migrate()` runs each one the table `migrations` doesn't record and records it, and `bpf migrate` starts the application, migrates and stops; a start creates nothing, so it no longer runs the whole schema, which is slow and redundant; tests migrate after they start. No principal is bound: authorization is at the boundary, so a migration's entity operations need none | F20 | `bpf migrate` on an empty database creates the tables, a second run applies nothing | done |
| R9.5 | Users are created and changed by administrators only, through the actor `user-administrator`, granting the entity endpoints on `user` (a token no longer creates its user, done); the generic entity actors except `user` (`except` in grants); a migration of the application inserts the user `administrator` with the administrator role; `security.actAs` in the app config maps a login's subject to a user; the administrator and its migration are the application's (`administrator-role` is an application role, P20) | R9.3, R9.4 | `POST` and `PUT` on a user are refused without the administrator role; after `bpf migrate`, a login whose subject `actAs` maps to `administrator` may create users | done |
| R9.6 | Actors and roles per endpoint in the tools: where an endpoint's dimensions are a closed set, `bpf explain` lists the actors granting it and the roles holding them, and a role's operations; `validate()` warns about an endpoint no actor grants and an actor grant that matches no endpoint | R9.2, F40 | `bpf explain` of the transition endpoint lists the underwriter and the roles holding it | draft |

## Core: execution and effects

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R2.5 | Execution tracing in a native execution object, beside `_ctx` | F21 | A run's path of nodes, operations and slot fills can be logged; `_ctx` holds no runtime internals | draft |

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
| R8.5 | Migrations as a separate step: declared migrations, `bpf migrate`, a start that checks the database version | F44 | Tables change through migrations only; a start against an outdated database fails | draft |
| R8.6 | Liveness and readiness endpoints | F43 | An orchestrator can tell a starting or stopping server from a ready one | draft |

## Entity traits

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R6.3 | Versionable trait: versions with validity intervals in `data.versions` | F22 | A demo entity type keeps versions; no table changes | draft |
| R6.4 | Reuse a states model through data composition in the demo | F22 | Two entity types share one states model element | draft |

## Domain concepts (G1)

| ID | Step | Refs | Done when | Status |
|---|---|---|---|---|
| R5.1 | Decision table kind | F12 | The demo has a rating or eligibility table | draft |
| R5.3 | Process orchestration outside the core (P14): a process kind built from entity states, message consumers and delayed messages; named steps, waits between pipelines, declared extension points | F9, Q3 | A multi-step demo process with a timer runs end to end; no core change is needed | draft |
| R5.4 | Messaging capabilities for R5.3: delayed delivery and routing a message to its process instance | Q3 | A delayed message arrives after its delay; a process instance receives only its own messages | draft |
