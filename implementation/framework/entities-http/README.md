# entities-http

REST endpoints for [entities](../entities/README.md). Every route targets the operation of the same name on `entities` (`create`, `read`, `update`, `delete`, `list`, each taking `{ entityType, request }`), which refuses an `entityType` that isn't an entity type (`not-found`) and invokes that operation of the entity type, so a request reaches no other operation, and each route's effects are known: the `GET` routes only read.

Each route's [operation](../authorization/README.md) is `{ area: "entities", resource: <entityType>, action: <operation> }` (`entity-types`: resource `entity-type`, action `read`); the [entity search](../entity-search-http/README.md) route's action is `search`. Actors: `entity-reader-actor` (area `entities`, action `query`) and `entity-editor-actor` (area `entities`).

| Method | Path | Operation | Status | ETag |
|---|---|---|---|---|
| `GET` | `/entity-types` | `entities.types` → `{ items: [{ id, kind, bodySchema, traits }] }`, `traits` mapping each trait to its configuration | 200 | |
| `GET` | `/entities/:entityType?limit&offset` | `list` | 200 | |
| `POST` | `/entities/:entityType` | `create` (body `{ businessKey?, body, traits? }`) | 201 | yes |
| `GET` | `/entities/:entityType/:businessKey?revision` | `read` | 200 | yes |
| `PUT` | `/entities/:entityType/:businessKey` | `update` (body `{ body }`, `If-Match` required) | 200 | yes |
| `DELETE` | `/entities/:entityType/:businessKey` | `delete` (`If-Match` required) | 200 | |

The ETag is the quoted revision (`"5"`); `If-Match` takes it back. Errors map as in [http-server](../../infrastructure/http-server/README.md): `invalid` 400, `not-found` 404, `conflict` 409.

Only these operations are exposed; `writeTrait` is not. Trait commands are exposed by their own packages ([entity-states-http](../entity-states-http/README.md)), and an operation that an entity class adds by an [`http-endpoint`](../../infrastructure/http-server/README.md#http-endpoint) written for it.
