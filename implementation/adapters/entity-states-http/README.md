# entity-states-http

`POST /entities/:entityType/:businessKey/transitions/:transition` → [`entity-states.transition`](../../entity/entity-states/README.md) → the record, with its revision as `ETag`. `If-Match` is required; the ETag conventions are those of [entities-http](../entities-http/README.md). The [operation](../../services/authorization/README.md) is `{ area: "states", resource: <entityType>, action: <transition> }`; actor `entity-lifecycle-actor` (area `states`, except the resource `user`).
