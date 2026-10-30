# security

The principal as scoped context.

- Schema `principal`: `{ userId, username?, email?, roles?, access?, … }`: `roles` are the process roles of the user, `access` the names of the [access profiles](../entity-row-access/README.md) that say which rows they reach, two assignments that don't depend on each other. The framework restricts nothing else: any property is a claim of the principal, as the application's users or identity provider supply them. An application states which claims exist by declaring the schema `principal-claims`, which [scopes](../entity-ownership/README.md#scopes) are checked against; without it they are not checked.
- Kind `principal-execution-node-wrapper` (an `execution-node-wrapper`) is the only manager of the context key `user`: no other kind can bind it, so no pipeline can grant itself a principal. Wrappers of this kind bind it: `asSystem` here, `authenticated` in [oauth](../oauth/README.md).
- Keyword `asSystem`: runs its pipeline as `{ userId: "system", roles: ["system"] }`.

Code reads the principal as `#._ctx.user` and works without one.
