# demo

An insurance application built on the [framework](../implementation/README.md): parties (searchable, with a `parties-by-type-search-query` search query at `POST /parties/search-by-type`) and construction contracts (an entity class with a numbered business key, a policyholder relation, a draft-only update guard and a `contract-activated` event). [Roles](security/roles.eson): an `underwriter-role` (its own `underwriter-actor`: contracts, their transitions except `activate`, and parties; plus the framework's `entity-reader-actor`), a `viewer-role` and an `administrator-role` ([authorization](../implementation/framework/authorization/README.md)).

```sh
cd implementation/server && npm run start-demo
```
