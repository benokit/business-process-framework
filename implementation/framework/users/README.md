# users

The internal representation of the users an external identity provider authenticates. Users hold no credentials.

- Entity type `user`: `{ subject, username?, email?, roles? }`, keyed by `subject` (the token's `sub`), with the [state](../entity-states/README.md) trait: `active` / `suspended` (`suspend`, `reactivate`).
- Users are created and changed only through the entity operations (over HTTP, the [entities API](../entities-http/README.md)); a token never creates one. Roles are internal: the application assigns them on the user, and the guard `known-roles` refuses a create or update naming a role that is no [`role`](../authorization/README.md#actors-and-roles) element (`invalid`, `unknown roles: …`).
