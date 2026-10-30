# oauth

Authentication of HTTP requests by OAuth 2.0 bearer tokens. Tokens come from an external identity provider; the framework only verifies them.

- Keyword `authenticated` (instance `authenticate`, kind [`principal-execution-node-wrapper`](../../platform/security/README.md)): verifies the `Authorization: Bearer` access token of its input (a request) against the issuer's keys (OpenID Connect discovery, JWKS), reads the internal [user](../users/README.md) whose business key is the token's subject (as the system principal) and runs its pipeline with `user` bound to `{ userId: subject, username, email, roles }` of that record. The `actAs` setting maps a user to the token subjects that act as it, separated by commas (`{ "actAs": { "administrator": "ada@example.com" } }`, `BPF__security__actAs__administrator=ada@example.com`): keyed by the user, whose key the application chooses, so a subject with any characters fits in the value of an environment variable. The deployment decides which login is, say, the administrator a migration created; whoever controls the configuration controls this. A token never creates a user: without a valid token, for a subject that is no user, or for a suspended user, the pipeline runs with `user` unbound.
- `authenticate-requests`: the first `requestMiddleware` of every `http-endpoint`, `{ "authenticated": { "next": true } }`.
- `user-cache` ([`in-memory-cache`](../../platform/cache/README.md), `ttl` 60 s): the user record of each subject, or `null` for a subject that is no user, so an authenticated request reads no database. `user-cache-eviction`, a broadcast consumer of [entity events](../../entity/entity-events/README.md) filtered to `user`, evicts a user's record in every running instance once a change to it is committed, so a new user, a role change or a suspension applies to the next request.
- Configuration: the settings of `authenticate` (kind `oauth-authentication-node-wrapper`): `issuer` (default `http://localhost:8080/default`, override with `BPF__authenticate__issuer`), `audience` (optional; checked when set) and `actAs`.

For development, [docker-compose](../../../environments/docker-compose.yml) runs [mock-oauth2-server](https://github.com/navikt/mock-oauth2-server) on port 8080; it issues a token for any subject:

```sh
curl -s -X POST http://localhost:8080/default/token -d 'grant_type=client_credentials&client_id=ada&client_secret=x&scope=bpf'
```
