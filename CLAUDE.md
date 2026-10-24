# Business Process Framework

## Architecture

The framework is built around **elements**: declarative JSON objects `{ id, kind, data }` loaded from `.eson` files. The **kind** is the abstraction: a kind is itself an element (of kind `kind`) that declares a `shape`, `operations`, `slots`, the `context` it manages and `lifecycle` hooks, and can `extends` another kind. Behaviour belongs to kinds; instances hold data.

- Pipelines are LambdaJSON trees, never strings. Mappings are pure; nodes are effects; `low` calls JS, declares its effects (`read`, `write`, `irreversible`, `trace`; everything else is inferred) and can't change context.
- `_ctx` is read-only and scoped: only a kind that manages a key may bind it, with `withContext`; any code sees every bound key.
- Program against kinds: an abstract kind declares operation contracts, a subkind implements them; `{ "instanceOf": "<kind>" }` references the single or bound (`binding`) instance, a string names one element.
- Slots are typed contribution points filled by `slot-fill` elements, ordered by `position`, `after`, `before`.

See [core/README.md](implementation/core/README.md) for pipeline rules, context, lifecycle and data composition. The design rationale lives in [design/](design/).

## Discovery

Ask the registry before reading element files (in `implementation/`, add `../demo` for the demo's elements): `npx bpf explain <id>` shows the resolved element (kind chain, data with defaults, operation contracts and who implements them, slot fills in order, source files); `npx bpf refs <id>` shows who references an element (before renaming or removing it); `npx bpf list [kind]` lists elements; `npx bpf vocabulary` lists node forms, node templates, LambdaJSON primitives and pure functions. After changing elements, run `npx bpf validate [paths]`: shapes, references and the code itself (node structure, operations, primitives, slots, `low` modules, context rights, effect bounds) in about a second, without infrastructure. See [tools](implementation/tools/README.md).

## Schema syntax (CJSL)

`"!field"` = required, `"field"` = optional, `"!field="` = fixed value, `"field=1": [...]` = enum, `"@schemaId"` = reference, `"field[]"` = array, `"field{}"` = map, `"$data#": [...]` = any-of, `"$data#1": [...]` = one-of, `"$data#&": [...]` = all-of. A property whose value is `false` is silently dropped.

## Implementation layout

`implementation/` holds the packages (core, infrastructure, framework, server, tools), indexed in [implementation/README.md](implementation/README.md); `demo/` is the insurance example application.

## LambdaJSON

Key refs: `"#"` (input), `"#.field"` (lodash path), `"@name"` ($let var), `"\\literal"` (escape). Expression forms: primitive (≤2 keys, all registered), function call (≤2 keys, all `$`), plain object (everything else). `{ "$literal": … }` keeps a tree as data. Pure functions are `$func/<id>`.

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

PostgreSQL: `postgresql://admin:password@localhost:5432/app` (override: `POSTGRES_URL`). NATS: `nats://localhost:4222` (`NATS_URL`). Meilisearch: `http://localhost:7700` (`MEILISEARCH_URL`). OAuth identity provider (mock): `http://localhost:8080/default` (`OAUTH_ISSUER`). Tests that need them skip when unavailable; a test with stubbed effects needs none ([interpreters](implementation/core/README.md#interpreters)). Lint with `npx eslint .`.

## Key conventions

- `.eson` files contain arrays of element objects (or a single object). Element ids share one namespace: a kind and its instance need different ids.
- Errors are `CoreError` (`code`, `message`, `data`); `throw` in a pipeline raises one. HTTP maps `invalid` 400, `unauthorized` 401, `forbidden` 403, `not-found` 404, `conflict` 409.
- Configuration is `app-config` elements plus `BPF__<section>__<key>` environment variables, read with `$func/app-config-section`; it is never in `_ctx`.
- `entity-record` shape: `{ id, entityType, businessKey, revision, data, timestampUtc }`; `data` maps traits to values; `body`, the business data, is a trait like any other, structurally special only because every entity has it. See [framework/entities](implementation/framework/entities/README.md).
