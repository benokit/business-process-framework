# oauth

Authentication of HTTP requests by OAuth 2.0 bearer tokens. Tokens come from an external identity provider; the framework only verifies them.

- Keyword `authenticated` (instance `authenticate`, kind [`principal-execution-node-wrapper`](../security/README.md)): verifies the `Authorization: Bearer` access token of its input (a request) against the issuer's keys (OpenID Connect discovery, JWKS), identifies its subject as an internal [user](../users/README.md) (`user.identify`, as the system principal) and runs its pipeline with `user` bound to `{ userId: subject, username, email, roles }`. Without a valid token, or for a suspended user, the pipeline runs with `user` unbound.
- `authenticate-requests`: the first `requestMiddleware` of every `http-endpoint`, `{ "authenticated": { "next": true } }`.
- `user-cache` ([`in-memory-cache`](../../infrastructure/cache/README.md), `ttl` 60 s): the user record of each subject, so an authenticated request reads no database. `user-cache-eviction`, a broadcast consumer of [entity events](../entity-events/README.md), evicts a user's record in every running instance once a change to it is committed, so a role change or a suspension applies to the next request.
- Configuration: the `oauth` app config section, `issuer` (default `http://localhost:8080/default`, override with `BPF__oauth__issuer`) and `audience` (optional; checked when set).

For development, [docker-compose](../../../environments/docker-compose.yml) runs [mock-oauth2-server](https://github.com/navikt/mock-oauth2-server) on port 8080; it issues a token for any subject:

```sh
curl -s -X POST http://localhost:8080/default/token -d 'grant_type=client_credentials&client_id=ada&client_secret=x&scope=bpf'
```
