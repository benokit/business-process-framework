# authorization-basic

JWT-based authentication. Provides a `/login` endpoint and an HTTP middleware that validates Bearer tokens.

## Login endpoint

`POST /login`

Request body:

| Field | Type | Description |
| --- | --- | --- |
| `username` | string | The user's username |
| `password` | string | The user's plain-text password |

Response body on success (`200`):

| Field | Type | Description |
| --- | --- | --- |
| `token` | string | Signed JWT valid for 24 hours |

Throws `"invalid credentials"` if the username does not exist or the password is wrong.

The JWT payload contains `{ userId, username, email }`.

## HTTP middleware: `jwt-auth-middleware`

`kind: "http-middleware"`, `ordering: 5`.

Reads the `Authorization: Bearer <token>` header, validates the JWT signature and expiry, and writes `{ userId, username, email }` into `_ctx.user`. Endpoints that require authentication should check for `_ctx.user`.

If the header is absent the middleware passes through without setting `_ctx.user`. If the header is present but invalid the token verification returns `null` and `_ctx.user` is not set.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_SECRET` | `default-secret-change-in-production` | HMAC-SHA256 signing secret — **must be overridden in production** |
