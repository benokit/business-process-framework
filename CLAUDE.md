# Business Process Framework

## Architecture

The framework is built around **elements** — declarative JSON objects loaded from `.eson` files. Every element has an `id`, a `kind` string tag, and a `data` object. `kind` drives both behaviour and querying: `schema` elements register a CJSL schema, `service` elements expose a callable API, and all other kinds are plain data.

Elements are loaded via `loadElements(paths)` from `core/elements-loader`. Services are invoked via `execute(serviceId, methodName, input, _ctx?)` from `core/service`. `_ctx` is an optional shared context object (default `{}`) that propagates through the entire execution graph.

See [core/README.md](implementation/core/README.md) for full details on element structure, pipelines, pipeline context/input shape, `set` merge behaviour, execution node templates, and JS module conventions.

## Schema syntax (CJSL)

`"!field"` = required, `"field"` = optional, `"!field="` = fixed value, `"@schemaId"` = reference, `"field[]"` = array, `"field{}"` = map, `"$data#1": [...]` = one-of, `"data#&": [s1, s2]` = allOf.

## Implementation layout

```
implementation/
  core/            # Framework runtime (elements-loader, service, schema, data, date, random)
  infrastructure/  # See infrastructure/README.md for index
  framework/       # See framework/README.md for index (includes entities, security/*)
```

See [infrastructure/README.md](implementation/infrastructure/README.md) for the infrastructure package index.
See [framework/README.md](implementation/framework/README.md) for the framework package index.

## LambdaJSON

Source: `implementation/node_modules/lambdajson-js/src/`. Key refs: `"#"` (input), `"#.field"` (lodash path), `"@name"` ($let var), `"\\literal"` (escape). Expression forms: primitive (≤2 keys, all registered), function call (≤2 keys, all `$`), plain object (everything else). `$let` only propagates vars in the first two forms. See source for full primitives list.

## Documentation rules

1. One owner per fact — link, never copy.
2. Detail at the leaf (package READMEs), summary at the root (index READMEs).
3. No duplicate examples.
4. Update the owner, not the reference.
5. Add a per-package README + index row for every new package.

## Running tests

Tests use **Mocha + Chai** (`"test": "mocha --exit"` per package). Start infrastructure:

```sh
docker compose -f environments/docker-compose.yml up -d
```

PostgreSQL: `postgresql://admin:password@localhost:5432/app` (override: `POSTGRES_URL`). NATS: `nats://localhost:4222` (override: `NATS_URL`). Both skip gracefully when unavailable.

## Key conventions

- `.eson` files contain arrays of element objects (or a single object).
- Service errors are thrown as strings (not Error objects).
- `entity-record` shape: `{ id, businessKey, revision, data, state }`. `businessKey` required non-empty string on create. Optimistic concurrency: `update`/`delete` require matching `revision`.
