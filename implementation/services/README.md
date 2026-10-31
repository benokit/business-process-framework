# Services

Application services that run on entities and the HTTP server: authorization, state permissions, users, OAuth authentication.

| Package | Description |
| --- | --- |
| [authorization](authorization/README.md) | Endpoint operations as points in extensible dimensions, actors granting them, roles of actors |
| [oauth](oauth/README.md) | OAuth 2.0 bearer tokens: the `authenticated` request middleware |
| [state-permissions](state-permissions/README.md) | The `state` dimension of operations: who may modify an entity in which state |
| [users](users/README.md) | The `user` entity type: users of an external identity provider |
