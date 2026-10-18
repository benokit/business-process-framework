# authorization-basic

JWT authentication for HTTP.

- `POST /login` with `{ username, password }` → `{ token }` (`authentication.login`): a signed HS256 token valid for 24 hours, with the principal `{ userId: username, username, email, roles }`. Wrong credentials: `unauthorized` (401).
- Keyword `authenticated` (instance `authenticate`, kind [`user-scope`](../security/README.md)): verifies the `Authorization: Bearer` header of its input (a request) and runs its pipeline with `user` bound to the principal, or unbound without a valid token.
- `authenticate-requests`: the first `requestMiddleware` of every `http-endpoint`, `{ "authenticated": { "next": true } }`.
- The secret is `authorization.jwtSecret` in the app config (override with `BPF__authorization__jwtSecret`; the default must not be used in production).
