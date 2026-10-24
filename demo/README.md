# demo

An insurance application built on the [framework](../implementation/README.md): parties (searchable, with a `parties-by-type-search-query` search query at `POST /parties/search-by-type`) and construction contracts (an entity class with a numbered business key, a policyholder relation, a draft-only update guard and a `contract-activated` event).

```sh
cd implementation/server && npm run start-demo
```
