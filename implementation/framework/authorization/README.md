# authorization

Authorization at the boundary ([P19, P20](../../../design/postulates.md)): every [HTTP endpoint](../../infrastructure/http-server/README.md#http-endpoint) maps its request to a logical operation, modules grant operations to their actors, and the application assigns actors to roles. The reasons behind the model are under [Design](#design).

## Operations

An operation is a point in a space of plain dimensions, the fills of the slot `dimensions` of `authorization` (instance `default-authorization`), in slot order: `area`, `resource`, `action`. A dimension is `{ name, default?, parents? }`; a module adds one with a fill. An endpoint's `operation` is a mapping to the dimensions:

```json
"operation": { "area": "states", "resource": "#.input.entityType", "action": "#.input.transition" }
```

- It sees `{ params, query, headers, input }`, where `input` is the target's input, typed by its contract, so what is authorized is what the target receives.
- A dimension it doesn't name takes the dimension's `default` (a mapping over the same scope).
- Every dimension is a closed set of values: a literal, an enum, `@ref/<kind>` (the transitions of [entity-states](../entity-states/README.md) are the schema `entity-transition`).
- `parents` maps a value to the values above it: for `resource`, the kind chain (`$func/kind-chain`, so an entity class is above its entity types); for `action`, the levels `query` (`read`, `list`, `search`) and `command` (everything else).

## Actors and roles

```json
{ "id": "underwriter-actor", "kind": "actor", "data": { "grants": [
    { "area": ["entities", "states"], "resource": "insurance-contract-type" },
    { "area": "entities", "resource": "party", "action": "query" }
] } }
{ "id": "back-office-role", "kind": "role", "data": { "actors": ["underwriter-actor"] } }
```

- A grant permits the cartesian product of its dimensions: a value, an array of values or `*`; a dimension it doesn't name is `*`; a value covers everything below it.
- `except` lists boxes the grant doesn't permit (`{ "area": "entities", "except": [{ "resource": "user" }] }`): the grant is its box minus them, so permissions stay a union and adding a role never removes one. An exception of a value no endpoint performs excepts nothing, so a generic actor may name a resource of a package that isn't loaded.
- A module declares actors, never roles; the application declares roles, which list actors, may grant directly (`"grants"`, like an actor's) for permissions of its own, and may include other roles (`"roles"`): a role permits the union of its own grants, its actors' grants and what the roles it includes permit, at any depth (`{ "id": "senior-underwriter-role", "kind": "role", "data": { "roles": ["underwriter-role"], "actors": ["contract-activator-actor"] } }`). A user holds role names, which the [users](../users/README.md) guard checks against the `role` elements.

## Enforcement

`authorize-requests`, a `requestMiddleware` of every endpoint, first among them after `authenticate-requests` ([oauth](../oauth/README.md)): a `public` endpoint serves anyone; otherwise a request without a principal (`_ctx.user`) fails with `unauthorized` (401), and one whose user holds no role permitting the operation with `forbidden` (403, `data.operation`).

- `$func/endpoint-operation({ endpoint, request })`: the request's operation, every dimension named (`null` where neither the endpoint nor a default names it).
- `$func/permits({ operation, roles })`: whether a role permits it. At first use after boot, the grants of every role, through its actors and the roles it includes, are put in a trie with one level per dimension, whose edges are the values an endpoint can have that a grant covers (a value covers itself and the values below it) and `*`, and whose leaves are role sets; a grant with `except` is split into the boxes of its difference, `*` minus a value being the other values endpoints perform; a lookup follows, per level, the edge of the operation's value and `*`. A value no endpoint performs matches only `*`.

Tests bind a principal without an identity provider with the header principal of [test/principal.js](test/principal.js) (`x-role`).

## Validation

`validate()` reports, on `default-authorization`: an operation naming an unknown dimension, missing one without a default, reading an unknown path, or with a dimension that isn't a closed set; a grant (or its `except`) naming an unknown dimension, a grant naming a value that no endpoint's operation can have, nor is above one; a dimension declared twice; a role that includes itself, with the cycle. The reference check reports a role naming an unknown actor or role. [http-endpoint](../../infrastructure/http-server/README.md#http-endpoint) reports an endpoint with neither `operation` nor `public`.

It warns about an endpoint no actor grants any operation of (`bpf validate`, `validate({ warnings: true })`).

## Explanation

[`bpf explain`](../../tools/README.md) shows, through the `explain` hook of `authorization`:

- for an endpoint, the values each dimension of its operation can have, and the actors and roles that permit `all` or `some` of the operations they combine to (`public` for a public one);
- for an actor, the endpoints it grants (`all`, `some`) and the roles holding it, directly or through a role they include;
- for a role, its actors, its own grants, the roles it includes and those including it, and the endpoints it permits;

An endpoint's operations are the product of its dimensions' values, so `some` may stand for combinations that never occur (a transition another entity type has).

## Design

- **Dimensions, not URL patterns.** A policy over URLs would depend on the route layout, and two endpoints couldn't share an operation. An operation is a logical point that any route can map to.
- **What the rule sees.** The payload may decide which operation a request is (a command or transition named in the body), so the rule reads the target's input: what is authorized is what the target receives, never a raw body the target reads differently. A dimension must be a closed set, since a grant can name only values it can enumerate, and the index can expand a branch only over known values.
- **Values of the data are the domain's.** An amount limit or "own records only" is not identifying an operation: it is a guard seeing `_ctx.user` and the validated record.
- **Extensible dimensions.** A grant that doesn't name a dimension matches any value of it, and a dimension's `default` serves the endpoints that don't name it, so grants and endpoints written before a dimension existed keep their meaning.
- **Levels named `query` and `command`,** since `read`/`write` would collide with the action `read`. The package is apart from [security](../security/README.md) (the principal), because it depends on the HTTP endpoints.
- **Cost.** Actors, arrays, hierarchies and exceptions are expanded once into the trie; a lookup follows at most 2ⁿ paths for n dimensions, in practice few, whatever the number of actors, roles and grants. A flat index of the 2ⁿ keys would do while n is small; the trie keeps lookups cheap as dimensions are added. Should a dimension ever not be a closed set, its branches can't be expanded: the request would expand its value to its ancestors instead, at most Π(dᵢ + 1) paths for hierarchy depths dᵢ.
- **No deny.** Permissions are monotonic: adding a role or an actor never removes one. A deny would make a role's meaning depend on the user's other roles, need a conflict rule that hierarchies make surprising (an allow on `construction` against a deny on its entity class), and let one module's actor revoke what another's grants in the same role, against P20. The needs behind it are met otherwise: blocking a person is the user's `suspended` state, separation of duties (the creator can't approve) depends on data and is a guard, withdrawing a capability is removing the actor; "everything except" is `except` within one grant.
- **Grants on roles.** P20 keeps modules from knowing roles, not the application from granting, so a one-off permission of the application needs no actor of its own, and generic actors need no parameters for the application's resources. Tasks are never assigned to a generic actor, whose instance would be unclear, so this doesn't weaken work assignment.
- **Roles that include roles** form a graph without cycles, not a tree: a role may be part of several aggregates. Inclusion only adds, since there is no deny, and it is flattened into the trie, so a lookup doesn't change. Actors don't include actors: composing participants is the application's, through roles.
- **The first administrator** can't be created through the API, which needs one: an application migration creates it, and `security.actAs` ([oauth](../oauth/README.md)) maps a deployment's login to it, so no element file holds a subject or credential.
- **Out of scope:** message consumers, where no user interacts with the system (P19); data-level scopes (row filters).
