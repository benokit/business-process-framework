# integration

An abstract kind's contract is owned by the provider (`database.execute`); an integration's is owned by the consumer: a logical operation a module needs, implemented once per provider kind by an adapter package, so the module stays independent of the provider ([G9](../../../design/project-goals.md)).

The kind `integration`: `provider` (a kind), `input` and `output` (schemas), `errors` (the codes it may raise). Its slot `implementations` holds `{ provider: <kind>, implementation: <method> }` fills; `run(input)`:

1. checks the input against `input`;
2. takes the bound or single instance of `provider` and runs the implementation for the most specific kind in its chain, with the input as `#.input`;
3. raises a declared error as is and any other as `undeclared-error` (with the original in `data.error`);
4. checks the output against `output`.

No implementation for the provider fails with `unimplemented-integration`, and `validate()` reports every provider instance an integration has no implementation for: the list of what replacing a provider costs. The effects of `run` are inferred from all implementations.

A subkind fixes the provider in its `fixed` values, like [`query`](../database/README.md#queries).

`$func/provider-implementation({ provider, implementations })` is the same choice for any implementations slot: the value for the most specific kind of the `provider` element (an id or `{ instanceOf }`), or `null`. A [`search-index`](../search/README.md) picks its engine settings with it.
