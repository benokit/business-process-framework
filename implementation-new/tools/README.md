# tools

`bpf-validate [<elements-path> ...]`: boots every installed `@business-framework/*` package with elements plus the given directories (the `load` phase only, nothing starts) and runs the core's [`validate()`](../core/README.md). Prints one `code: message` line per problem and exits `1`, or prints `valid`.

```sh
npx bpf-validate ../demo-new
```

From code: `validateApplication({ packages?, paths? })` → problems.
