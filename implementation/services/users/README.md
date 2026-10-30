# users

The internal representation of the users an external identity provider authenticates. Users hold no credentials.

- Entity type `user`: `{ subject, username?, email?, roles?, access?, … }` (any other property is a claim of the principal), keyed by `subject` (the token's `sub`), with the [state](../../entity/entity-states/README.md) trait: `active` / `suspended` (`suspend`, `reactivate`).
- Users are created and changed only through the entity operations (over HTTP, the [entities API](../../adapters/entities-http/README.md) and the [transitions](../../adapters/entity-states-http/README.md)); a token never creates one. Actor `user-administrator-actor` grants them (areas `entities` and `states`, resource `user`); the generic entity actors except `user`. Roles are internal: the application assigns them on the user, and the guard `known-roles` refuses a create or update naming a role that is no [`role`](../authorization/README.md#actors-and-roles) element (`invalid`, `unknown roles: …`).
