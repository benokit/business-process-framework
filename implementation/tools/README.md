# tools

`bpf <command> [--json] [<elements-path> ...]` boots every installed `@business-framework/*` package with elements plus the given directories (the `load` phase only, nothing starts, no infrastructure needed) and reads the result from the registry, so it shows what runs, not what the files say one by one. Output is compact text; `--json` gives the full structure.

| Command | Output |
|---|---|
| `validate` | the core's [`validate()`](../core/README.md) with warnings: one `code: message` line per problem, warnings prefixed with `warning`, exit code `1` when there is an error, `valid` when there is none |
| `explain <id>` | the resolved element: its kind and source file, the kind chain, the data with the kind's fixed values and the settings it has (path, type, mode values, default, the environment variable that sets it; never the effective values) (for a kind: the shapes along the chain, fixed values, settings, managed context, lifecycle hooks, instances, bindings), each operation's contract with the kind that declares it and the kind that implements it (or `abstract`) and, for an instance, its [effects](../core/README.md#effects) (with `--json`, each with its trace), and each slot with its declaration and its fills in the order they apply, then what packages add through `explain` hooks ([core](../core/README.md#validation); [authorization](../services/authorization/README.md#explanation): who may call an endpoint, what an actor or role reaches) |
| `refs <id>` | every place that references the element, with the referencing element, the path, the kind of reference (`ref`: a typed reference in data or a node, `invoke`, `template`: a node of a template, `function`: a `$func/` call, `slot`: the element of a `$func/slot-values` call, `kind`) and its source file; the same walk over code as the code checks of `validate()` |
| `list [<kind>]` | the elements with an id, or the instances of a kind and its subkinds, with kind and source file |
| `vocabulary` | node forms (keyword and companion keys), node templates with their elements, LambdaJSON primitives with their arguments, pure functions with their signatures |
| `trace <element> <operation>` | starts the application (like `migrate`), runs the operation once with `--input <json>` through `traced` and prints the elements it passes, indented, with the effects of `low` nodes, durations and the failure, then the result. Writes (`write`, `irreversible`) are skipped unless `--live`; `--steps` also shows every pipeline step; `--json` prints the spans. Reads hit the real infrastructure |
| `migrate` | starts the application (its HTTP server on a port of its own), runs `database.migrate()` ([migrations](../platform/database/README.md#migrations)) and stops: one `applied <id>` line per migration, or `nothing to apply`; needs the infrastructure |
| `schema <command>` | the JSON Schema of the `--json` output of a command (`validate`, `explain`, `refs`, `list`, `vocabulary`, `trace`, `migrate`) |
| `render <command>` | reads the `--json` output of a command from stdin and prints the text view: `bpf explain x --json | bpf render explain` |

## Output

The result of every command is a plain JSON value (no envelope) with `--json`, and a text view of it otherwise; the views are pure functions of the value (`renderers`), so output can be stored, piped to another service and rendered elsewhere. The shapes are declared in [outputs.js](src/outputs.js) (`outputSchemas`, printed by `bpf schema`) and checked against the real output by the tests. stdout carries the result, stderr the diagnostics: a failure is `describeError` text, or `{ code, message, data }` with `--json` (`data.frames` is the route, see [core](../core/README.md)). Exit code `0` on success, `1` on failure (`validate`: a problem that is not a warning), `2` on wrong usage. `source` paths are relative to the working directory.

```sh
npx bpf validate ../demo
npx bpf explain insurance-contract-type ../demo
npx bpf refs user-cache
npx bpf list entity-type ../demo
npx bpf vocabulary
npx bpf trace entities read --input '{"entityType":"construction","request":{"businessKey":"CON-2026-0001"}}' ../demo
```

From code: `bootApplication({ packages?, paths? })`, `validateApplication(options)` → problems, `explain(id)`, `refs(id)`, `list(kind?)` and `vocabulary()` → descriptions, `renderExplanation`, `renderRefs`, `renderList` and `renderVocabulary` → text.
