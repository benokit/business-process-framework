# security

The principal as scoped context.

- Schema `principal`: `{ userId, username?, email?, roles? }`.
- Kind `user-scope` (an `execution-node-wrapper`) is the only manager of the context key `user`: no other kind can bind it, so no pipeline can grant itself a principal. Wrappers of this kind bind it: `asSystem` here, `authenticated` in [authorization-basic](../authorization-basic/README.md).
- Keyword `asSystem`: runs its pipeline as `{ userId: "system", roles: ["system"] }`.

Code reads the principal as `#._ctx.user` and works without one.
