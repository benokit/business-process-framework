# Tools

Developer tools for discovery, validation, and workspace analysis.

## Workspace validation

Validates all elements in a workspace against their corresponding schemas.

For each element, the validator resolves the corresponding schema by matching the element's `kind` against registered schema ids. If the element's exact kind has no schema, parent kinds are tried in order (e.g. `a/b/c` → `a/b` → `a`). Elements that have a matching schema are validated; those without one are skipped.

Elements with lazy `/data` (deferred evaluation) are skipped since their data is not available statically.

### CLI

```sh
bpf-validate <elements-path> [<elements-path> ...]
```

Exits `0` when all elements are valid. Exits `1` and prints a report for each failing element:

```
/path/to/file.eson:12
  Element "my-service" (kind: service) failed schema "service":
    /interface/create/input: must be object
```

### Programmatic API

```js
import { validateWorkspace } from '@business-framework/tools/validate-workspace';

const failures = await validateWorkspace(['./elements', './app/elements']);
for (const { element, file, line, schemaId, errors } of failures) {
    // element — the raw element object
    // file    — absolute path to the .eson file
    // line    — 1-based line number of the element in its file
    // schemaId — the matched schema id
    // errors  — AJV error objects
}
```
