# Kind values and settings

Status: **implemented** (R10.2 to R10.4). It replaced the `defaults` property of a kind. The postulate is P22 in [postulates.md](postulates.md); the work is R10 in [refactoring-plan.md](refactoring-plan.md). The composition algebra of `/data` is in [data-composition.md](data-composition.md).

## 1. Why `defaults` goes

`defaults` was a deep merge along the kind chain, then of the instance over the result. It carried two different things: values a subkind supplies and no instance changes (`provider: "search-engine"`), and tuning that deployments change (`maxEntries`). Composing them needed a typed algebra, a narrowing proof for schemas and a check against a partial of the shape (the former Q5 and Q11), all because a schema can sit in a default. Splitting the two removes the problem:

| | Is | Lives in | Changed by |
|---|---|---|---|
| **shape** | what an instance may contain | the kind | nobody (children only narrow, all-of) |
| **`fixed`** | values a kind supplies | the kind | nobody |
| **settings** | what a deployment tunes | the kind (schema and defaults), `app-config`, environment | the deployer |

A rule of thumb: if two environments would differ, it is a setting.

## 2. `fixed`

```json
{ "id": "search-integration", "kind": "kind",
  "data": { "extends": "integration",
            "fixed": { "provider": "search-engine", "output": "@search-result" } } }
{ "id": "product-search", "kind": "search-integration", "data": { "input": "@product-query" } }
```

- **Union along the chain.** `fixed` values of the chain are united deeply. The same path with a different value is a conflict, reported by `validate()` with both kinds named. A child adds paths and can't change an inherited one. Equal values (deep equality) are accepted.
- **Instances.** The effective data of an instance is its own data united with the chain's `fixed` values, under the same rule: an instance that writes a different value for a fixed path is an error, one that repeats it exactly is accepted. The fill-in happens before the shape's required-field check, so a required `provider` is satisfied.
- **Checked by the shape.** Every instance is validated after the fill-in, so a fixed value of the wrong type is reported as soon as an instance exists. Checking a kind without instances needs a small walker through the shape's declared object fields; it is optional.
- This is the only data composition in inheritance; it needs no types, markers or walker.

## 3. Settings

A kind declares the settings of its deployment: a schema and defaults. The section is named by the element id, and ids with hyphens map `-` to `_` in a variable name.

```json
"settings": {
  "shape": {
    "retry": {
      "$data#1": [
        { "!mode=": "none" },
        { "!mode=": "fixed", "!max": "integer", "!delayMs": "integer" },
        { "!mode=": "exponential", "!max": "integer", "!delayMs": "integer", "!factor": "number", "!maxDelayMs": "integer" }
      ]
    },
    "timeoutMs": "integer",
    "errors[]": "string"
  },
  "defaults": { "retry": { "mode": "fixed", "max": 3, "delayMs": 100, "factor": 2, "maxDelayMs": 5000 },
                "timeoutMs": 5000, "errors": ["unavailable"] }
}
```

(The one-of keyed by `mode` declares the parameters of each mode explicitly. A parameter that a mode doesn't read is **ignored**, not rejected, so a deployer switches behaviour with one variable, `BPF__search_integration__retry__mode=exponential`, and the defaults supply the parameters of the other modes. A parameter that the chosen mode requires and no layer supplies fails the start, naming the mode and the variable to set.)

### Env-addressable shapes

Settings must be manageable entirely by environment variables. `validate()` rejects a settings shape that breaks these rules:

1. Leaves are primitives: string, integer, number, boolean, enum.
2. Names are camelCase identifiers: no hyphens, dots or `__`, so a variable name maps to exactly one path.
3. Nesting is by object only. Arrays of objects are not allowed; maps of primitives are, with identifier keys.
4. Lists of primitives are set as one comma-separated variable (`…__errors=unavailable,timeout`); items may not contain commas.
5. Variants are selected by an explicit enum, the **mode**, which says which sibling settings the interpreter reads.

Structures that don't fit (rate tables, routing rules) are not settings: they are instance data, or an element composed with `/data`.

### Layers

For an instance `product-search` of `search-integration`, which extends `integration`, each layer is a section named by an element id (kind and instance ids share one namespace):

| Source | Layers, base first |
|---|---|
| declared `defaults` | `integration`, `search-integration` |
| `app-config` elements | section `integration`, `search-integration`, `product-search` |
| environment variables | `BPF__integration__…`, `BPF__search_integration__…`, `BPF__product_search__…` |

**Source ranks above specificity:** effective = defaults, then `app-config`, then environment; within a source a more specific layer wins. A deployer who sets a variable on the base kind expects it to beat a code-declared default of a subkind.

- **Composition is plain override.** Objects recurse; every other value, arrays included, replaces. There are no markers in inheritance, so a child changes `retry.mode` or `retry.delayMs` by writing that leaf. A default a child doesn't want is replaced by another value; a setting that may be absent is optional in the shape.
- **Instances** override through the deployment channel (an `app-config` element or variable in the section named by the instance id), never in their own data: the data of an instance is defined by the shape alone (P9).
- **The settings shape** is the all-of along the chain; a subkind can add settings or narrow existing ones. The effective settings must satisfy it; a required setting no layer supplies fails the start, naming the layers searched.
- **Environment values** are strings, converted by the shape (integer, number, boolean, enum). A value that doesn't convert fails the start. Environment layers set leaves only.
- **Reading.** `$func/settings` returns the effective settings of an element, composed through its kind chain and its own id. Its type is known, so `validate()` checks paths into it. Settings are never in `_ctx`.
- **Existing sections** (`postgresql`, `nats`, `http`, `outbox`, `meilisearch`, `oauth`, `security`) were renamed to the kinds that own them with a shape each; `security.actAs`, read by the oauth wrapper, became the `actAs` setting of its kind `oauth-authentication-node-wrapper`, set on the instance `authenticate`. The pipeline of a template doesn't know its own id (`#.self` is the caller's), so the wrapper names its instance.

### Discovery

`bpf explain <kind or instance>` lists the settings that are available: each leaf path, its type, the declared default, the section that supplies it and the variable name that would set it, the values of a mode enum. It doesn't read the environment, so it never prints a secret. Effective values are not its job.

### Validation

`bpf validate` checks, without infrastructure: the settings shape against the env-addressable rules, the defaults of every kind in a chain composed against the shape, and `app-config` elements against the shape. Environment variables are checked at start. `validate()` also warns about an `app-config` section or a `BPF__…` variable that matches no element with settings, and about a setting the element doesn't have (a typo has no other effect).

## 4. Consequences

- `defaults` is removed from the `kind` shape. The three uses that were fixed values (`search`, `database` integrations) move to `fixed`; `maxEntries` of the cache becomes a setting with a default.
- Inheritance composes no data with markers: shapes by all-of, `fixed` by union, settings defaults by plain override.
- Checked defaults, a partial of the shape and a narrowing proof are not needed.

## 5. Open points

- Whether `validate()` warns about a setting no code reads (a leaf in the shape that no `$func/settings` path reaches).
- Secret settings: a way to mark a setting so nothing prints it (relevant for a future `explain` of effective values).
- Whether the instance fill-in of `fixed` should be visible to the data-flow inference (it should: `self.data` has the fixed paths typed).
