# entities-http

REST endpoints for [entities](../entities/README.md). Every route targets `entities.dispatch({ entityType, operation, request })`, which refuses an `entityType` that isn't an entity type (`not-found`), so a request can only reach entity type operations: `create`, `read`, `update`, `delete`, `transition`, `list`.

| Method | Path | Operation | Status | ETag |
|---|---|---|---|---|
| `GET` | `/entity-types` | `entities.types` → `{ items: [{ id, kind, dataSchema, statesModel }] }` | 200 | |
| `GET` | `/entities/:entityType?limit&offset` | `list` | 200 | |
| `POST` | `/entities/:entityType` | `create` (body `{ businessKey?, data, initialState? }`) | 201 | yes |
| `GET` | `/entities/:entityType/:businessKey?revision` | `read` | 200 | yes |
| `PUT` | `/entities/:entityType/:businessKey` | `update` (body `{ data }`, `If-Match` required) | 200 | yes |
| `DELETE` | `/entities/:entityType/:businessKey` | `delete` (`If-Match` optional) | 200 | |
| `POST` | `/entities/:entityType/:businessKey/transitions/:transition` | `transition` (`If-Match` optional) | 200 | yes |

The ETag is the quoted revision (`"5"`); `If-Match` takes it back. Errors map as in [http-server](../../infrastructure/http-server/README.md): `invalid` 400, `not-found` 404, `conflict` 409.

Only these operations are exposed. An operation that an entity class adds is exposed by an [`http-endpoint`](../../infrastructure/http-server/README.md#http-endpoint) written for it.
