# Infrastructure Services

## `entity-database`

Generic document store with optimistic concurrency. Each document carries an `id`, a unique `businessKey`, a `version`, and a `data` object.

| Method   | Key input fields                                    | Returns         |
|----------|-----------------------------------------------------|-----------------|
| `create` | `collection`, `businessKey`, `data`                 | `entity-record` |
| `read`   | `collection`, `id` **or** `businessKey`             | `entity-record` |
| `update` | `collection`, `id`/`businessKey`, `version`, `data` | `entity-record` |
| `delete` | `collection`, `id`/`businessKey`, `version?`        | `entity-record` |
| `list`   | `collection`, `filter?`, `sort?`, `limit?`, `skip?` | `{ records[] }` |

`businessKey` must be a non-empty string, unique per collection. `update` and `delete` use optimistic locking via `version`.

---

## `sequence-generator`

Monotonically increasing integer counter per named sequence.

| Method | Key input fields | Returns             |
|--------|------------------|---------------------|
| `next` | `sequence`       | `{ value: number }` |

---

## `http-server`

HTTP server. On `start`, all `endpoint` data elements are loaded and registered as routes. Each endpoint maps an HTTP method + path to a service method.

| Method  | Key input fields | Returns            |
|---------|------------------|--------------------|
| `start` | `port?`          | `{ port: number }` |
| `stop`  | —                | `{}`               |

Endpoint data elements shape: `{ method, path, controller: { service, method } }`.
