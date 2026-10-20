# Business Process Framework

## Architecture

The framework is built around **elements**: declarative JSON objects `{ id, kind, data }` loaded from `.eson` files. The **kind** is the abstraction: a kind is itself an element (of kind `kind`) that declares a `shape`, `operations`, `slots`, the `context` it manages and `lifecycle` hooks, and can `extends` another kind. Behaviour belongs to kinds; instances hold data.

```js
import { boot, start, stop, invoke, validate } from '@business-framework/core';
await boot({ paths, elements });   // load elements, run 'load' hooks
await start();                     // run 'start' hooks in start order
await invoke('order', 'create', { data: { amount: 5 } });
validate();                        // on demand, never on start
```

- Pipelines are LambdaJSON trees, never strings. Mappings are pure; nodes are effects; `low` calls JS and can't change context.
- `_ctx` is read-only and scoped: only a kind that manages a key may bind it, with `withContext`; any code sees every bound key.
- Program against kinds: an abstract kind declares operation contracts, a subkind implements them; `{ "instanceOf": "<kind>" }` references the single or bound (`binding`) instance, a string names one element.
- Slots are typed contribution points filled by `slot-fill` elements, ordered by `position`, `after`, `before`.

See [core/README.md](implementation/core/README.md) for pipeline rules, context, lifecycle and data composition. The design rationale lives in [design/](design/).

## Schema syntax (CJSL)

`"!field"` = required, `"field"` = optional, `"!field="` = fixed value, `"field=1": [...]` = enum, `"@schemaId"` = reference, `"field[]"` = array, `"field{}"` = map, `"$data#": [...]` = any-of, `"$data#1": [...]` = one-of, `"$data#&": [...]` = all-of. A property whose value is `false` is silently dropped.

## Implementation layout

```
implementation/
  core/            # kinds, schemas, pipelines, slots, context, lifecycle, validation
  infrastructure/  # See infrastructure/README.md for the index
  framework/       # See framework/README.md for the index
  server/          # Starts an application; on-startup
  tools/           # bpf-validate
demo/              # Insurance example application
```

See [implementation/README.md](implementation/README.md) for the package index.

## LambdaJSON

Source: `implementation/node_modules/lambdajson-js/src/`. Key refs: `"#"` (input), `"#.field"` (lodash path), `"@name"` ($let var), `"\\literal"` (escape). Expression forms: primitive (≤2 keys, all registered), function call (≤2 keys, all `$`), plain object (everything else). `{ "$literal": … }` keeps a tree as data. Pure functions are `$func/<id>`.

## Documentation rules

1. One owner per fact — link, never copy.
2. Detail at the leaf (package READMEs), summary at the root (index READMEs).
3. No duplicate examples.
4. Update the owner, not the reference.
5. Add a per-package README + index row for every new package.

## Running tests

Tests use **Mocha + Chai** (`npm test` in `implementation/` runs every package). Start infrastructure:

```sh
docker compose -f environments/docker-compose.yml up -d
```

PostgreSQL: `postgresql://admin:password@localhost:5432/app` (override: `POSTGRES_URL`). NATS: `nats://localhost:4222` (`NATS_URL`). Meilisearch: `http://localhost:7700` (`MEILISEARCH_URL`). OAuth identity provider (mock): `http://localhost:8080/default` (`OAUTH_ISSUER`). Tests that need them skip when unavailable. Lint with `npx eslint .`.

## Key conventions

- `.eson` files contain arrays of element objects (or a single object). Element ids share one namespace: a kind and its instance need different ids.
- Errors are `CoreError` (`code`, `message`, `data`); `throw` in a pipeline raises one. HTTP maps `invalid` 400, `unauthorized` 401, `forbidden` 403, `not-found` 404, `conflict` 409.
- Configuration is `app-config` elements plus `BPF__<section>__<key>` environment variables, read with `$func/app-config-section`; it is never in `_ctx`.
- `entity-record` shape: `{ id, entityType, businessKey, revision, data, timestampUtc }`; `data` maps traits to values; `body`, the business data, is a trait like any other, structurally special only because every entity has it. See [framework/entities](implementation/framework/entities/README.md).
