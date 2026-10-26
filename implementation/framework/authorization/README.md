# authorization

Authorization at the boundary ([P19, P20](../../../design/postulates.md)): every [HTTP endpoint](../../infrastructure/http-server/README.md#http-endpoint) maps its request to a logical operation, modules grant operations to their actors, and the application assigns actors to roles. Design and resolution: [F20](../../../design/critique.md).

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
- A module declares actors, never roles; the application declares roles, which only list actors. A user holds role names, which the [users](../users/README.md) guard checks against the `role` elements.

## Enforcement

`authorize-requests`, a `requestMiddleware` of every endpoint, first among them after `authenticate-requests` ([oauth](../oauth/README.md)): a `public` endpoint serves anyone; otherwise a request without a principal (`_ctx.user`) fails with `unauthorized` (401), and one whose user holds no role permitting the operation with `forbidden` (403, `data.operation`).

- `$func/endpoint-operation({ endpoint, request })`: the request's operation, every dimension named (`null` where neither the endpoint nor a default names it).
- `$func/permits({ operation, roles })`: whether a role permits it. At first use after boot, the grants of every role, through its actors, are put in a trie with one level per dimension, whose edges are the values an endpoint can have that a grant covers (a value covers itself and the values below it) and `*`, and whose leaves are role sets; a grant with `except` is split into the boxes of its difference, `*` minus a value being the other values endpoints perform; a lookup follows, per level, the edge of the operation's value and `*`. A value no endpoint performs matches only `*`.

Tests bind a principal without an identity provider with the header principal of [test/principal.js](test/principal.js) (`x-role`).

## Validation

`validate()` reports, on `default-authorization`: an operation naming an unknown dimension, missing one without a default, reading an unknown path, or with a dimension that isn't a closed set; a grant (or its `except`) naming an unknown dimension, a grant naming a value that no endpoint's operation can have, nor is above one; a dimension declared twice. The reference check reports a role naming an unknown actor. [http-endpoint](../../infrastructure/http-server/README.md#http-endpoint) reports an endpoint with neither `operation` nor `public`.
