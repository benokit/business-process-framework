# tools

`bpf <command> [--json] [<elements-path> ...]` boots every installed `@business-framework/*` package with elements plus the given directories (the `load` phase only, nothing starts, no infrastructure needed) and reads the result from the registry, so it shows what runs, not what the files say one by one. Output is compact text; `--json` gives the full structure.

| Command | Output |
|---|---|
| `validate` | the core's [`validate()`](../core/README.md): one `code: message` line per problem and exit code `1`, or `valid` |
| `explain <id>` | the resolved element: its kind and source file, the kind chain, the data with the kind's defaults (for a kind: the shapes along the chain, defaults, managed context, lifecycle hooks, instances, bindings), each operation's contract with the kind that declares it and the kind that implements it (or `abstract`), and each slot with its declaration and its fills in the order they apply |
| `vocabulary` | node forms (keyword and companion keys), node templates with their elements, LambdaJSON primitives with their arguments, pure functions with their signatures |

```sh
npx bpf validate ../demo
npx bpf explain insurance-contract-type ../demo
npx bpf vocabulary
```

From code: `bootApplication({ packages?, paths? })`, `validateApplication(options)` → problems, `explain(id)` and `vocabulary()` → descriptions, `renderExplanation` and `renderVocabulary` → text.
