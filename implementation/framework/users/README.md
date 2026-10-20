# users

The internal representation of the users an external identity provider authenticates. Users hold no credentials.

- Entity type `user` (kind `user-entity-type`, an entity class): `{ subject, username?, email?, roles? }`, keyed by `subject` (the token's `sub`), with the [state](../entity-states/README.md) trait: `active` / `suspended` (`suspend`, `reactivate`).
- `user.identify({ subject, username?, email? })` returns the user of a subject, creating it on first sight (an operation the class adds to the entity type). Roles are internal: the application assigns them by updating the user.
