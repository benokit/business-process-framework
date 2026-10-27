# demo

An insurance application built on the [framework](../implementation/README.md): parties (searchable, with a `parties-by-type-search-query` search query at `POST /parties/search-by-type`) and construction contracts (an entity class with a numbered business key, a policyholder relation, a draft-only update guard and a `contract-activated` event). [Roles](security/roles.eson): an `underwriter-role` (its own `underwriter-actor`: contracts, their transitions except `activate`, and parties; plus the framework's `entity-reader-actor`), a `viewer-role` and an `administrator-role` ([authorization](../implementation/framework/authorization/README.md)). The migration [`administrator-user`](security/administrator.eson) creates the user `administrator` with the administrator role; the demo's [app config](security/app-config.eson) maps the login `admin` to it (the `actAs` setting of `authenticate`), so a token of the mock identity provider for `admin` administers users. A real deployment leaves that file out and maps its own login (`BPF__security__actAs__administrator=<subject>`).

```sh
cd implementation/server && npm run start-demo   # bpf migrate ../../demo, then start
```
