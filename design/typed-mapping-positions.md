# Typed code positions: what was decided

Status: **built** (F83 resolved, R3.8 and R3.9 done). Kept as the record of the decision and of the designs that were tried and dropped.

## 1. The problem

`validate()` infers every mapping and method of every element with `lambdajson-js`, and needs the type of the **input** of each. The core knows it for a fixed list of positions (a kind's `mapping` and hooks, a pure function's `mapping`, a slot fill). The code in a process definition sees the scope of the definition, computed from its data: its roles and their entity types, the body schemas, the variables, the input. Two definitions have two scope types, so it cannot be written in a schema (Q6 of the critique, in general: types that depend on the data of the owning element).

`entity-processes` therefore typed its code itself, in the `validate` hook of its kind (`definitions.js`), and kept a list of the mapping positions of `process-step` next to the schema that already declares them (`@mapping`): a drift, since a field added to the schema stayed unchecked until it was added to the list.

## 2. Decision

The part that must stay with the package is **the type of the scope**: it combines the definition with what the entities package knows about the records of an entity type. The framework cannot infer it: the runtime builds the real scope in `process-scope`, a pure function declared with an `any` output, and the contract of `read` gives no per-entity-type record shape (Q6).

What the framework can give is **the positions**. `codePositionsOf(element)` of `@business-framework/core/introspection` lists the code of an element as `{ type: 'mapping' | 'method', code, path }`, found from the schemas of its shape. The `validate` hook of `process-definition` takes the positions from it and types each with `mappingType` or `methodType`: a `do` gets the scope without `output`, an `onError.set` the scope with the `error` the entry catches, every other piece the scope; `key` is not typed. The package keeps no list of positions, and nothing new is asked of authors: no new schema syntax, no new kind property.

## 3. Designs tried and dropped

- **A function named in the schema** (`@mapping/<function>`), first with an abstract kind that fixed the contract of the providers. The schema then named a concrete implementation, and the core carried the id of an abstract kind to check it.
- **A scope name in the schema and `scopes` in the kind** (`@mapping/step`, the kind maps `step` to a type). It decoupled the schema, but it is a new concept for the authors of every package (a name between a schema and a kind, resolved along the kind chain), and the vocabulary should become simpler as the framework grows.
- **Inferring the scope from the code that builds it.** The right long-term answer. It needs the scope-building code to be typed and the record shape of an entity type to be part of the operation contracts (Q6); it is not available yet.

## 4. Also done

- The entries of `choose` are objects, `{ test, then }` and `{ else }`, as the `when` entries are: a tuple cannot be written in the compact schema language, and a position inside `any` is not found from the schema. The schema `process-choice` checks them.
- `methodType` and `mappingType` return their problems in one shape, `{ severity, code, path, message }`.
- The error scope is closed: `#.error.<unknown>` is reported.

## 5. Next: templates, types that depend on the data of the element

The sketch (blackboard, 2026-11-20): an element holds a `mapping`, and the type of its input depends on another field of the same element (`entityType: contracts`, then the record type of `contracts`). A plain `@mapping(input: object)` cannot say it. It is a template parameter, as in generics.

### 5.1 Design

The schema declares only **names of holes**; **the kind fills them** with ordinary code. No expression language lives in the schema.

Two forms in a schema:

- `@mapping/T` and `@method/T`: `T` must resolve to `{ input, output }`, two schemas;
- `@type/T`: `T` must resolve to a plain schema.

The kind (or a subkind, which overrides) declares `templates`: for each name, a mapping over the element, `{ id, data }` like the `mapping` of a kind, that returns what the form needs. It is a literal schema object, a call of a predefined resolver (`record-of`, `operation-input`, `operation-output`, `schema-of`) or any pure function.

```json
{ "id": "a-kind", "kind": "kind", "data": {
    "shape": { "!entityType": "@ref/entity-type", "!mapping": "@mapping/entity-mapping" },
    "templates": { "entity-mapping": { "input": { "$func/record-of": "#.data.entityType" }, "output": "@any" } } } }

{ "id": "an-instance", "kind": "a-kind", "data": { "entityType": "contracts", "mapping": "#.data.body.something" } }
```

`validate` resolves `entity-mapping` against the data of `an-instance` and checks `#.data.body.something` against the record schema of `contracts`: `unknown-path` as in any typed mapping. Instance authors write nothing; kind authors write one `templates` map.

Rules:

1. **Lookup.** A name resolves in the kind of the element being validated, along the `extends` chain; a subkind can override it. A reusable schema (`process-step`) works only where the owner declares its names: every kind that reaches a schema with an unresolved name gets `unresolved-template` at load, like an unbound variable.
2. **Nesting.** A resolved schema may contain further `@type/other` or `@mapping/other`; the framework resolves them recursively and reports a cycle.
3. **Anywhere.** A name can be used wherever a schema is written (shape, slot inputs, operation contracts, nested schemas), not only in `shape`.
4. **Slots.** In a slot input, a name resolves against the data of the fill's target element, with the templates of the kind that owns the slot. The fill declares nothing.
5. **Checked results.** The result of a template is validated: `{ input, output }` or a schema. An error in a resolver is a problem on the instance, not a crash.
6. **No silent `any`.** A template that cannot be resolved (missing field, a ref to nothing) reports the position as untyped.
7. **References.** A template reads constants of the element data. A `@ref` field gives an element id; the resolver loads the element from the registry (`record-of` goes entity type, traits, body schemas). The schema never describes a path through other elements. A path into something computed at run time is not resolvable (rule 6).

### 5.2 Examples

*`http-endpoint`* (today the input of `request` and `response` is `any`):

```json
"shape": { "!target": { "!element": "@ref", "!operation": "string" },
           "request": "@mapping/request-mapping", "response": "@mapping/response-mapping" },
"templates": {
    "request-mapping":  { "input": "@http-request", "output": { "$func/operation-input": "#.data.target" } },
    "response-mapping": { "input": { "$func/operation-output": "#.data.target" }, "output": "@http-response" }
}
```

*A slot on `entity-type`*: the slot input uses `@type/record`, so every fill of `reactions` of `contracts` sees the body of `contracts` typed:

```json
"slots": { "reactions": { "cardinality": "many", "value": "@method", "input": { "!record": "@type/record", "!change": "object" } } },
"templates": { "record": { "$func/record-of": "#.id" } }
```

*A trait hook*: `"guard": "@method/guard"` with `"guard": { "input": { "!configuration": { "$func/schema-of": "#.data.configuration" }, "!record": "@entity-record" }, "output": "@any" }`.

*The process definition*: `"steps{}": "@process-step"`, in which every `@mapping` is `@mapping/step-code`, and `"step-code": { "input": { "$func/process-scope": "#" }, "output": "@any" }` with `process-scope` the existing `scopeOf`. The `validate` hook and its use of `codePositionsOf` go away.

### 5.3 Measurement


| Group | Positions | Input type decided by |
|---|---|---|
| kind operations and hooks, `kind.mapping`, pure-function mappings, node templates and wrappers | 232 | the kind or function itself (typed today) |
| slot-fills with a fixed slot input | about 32 | the slot declaration (typed today) |
| slot-fills on `entity-type` slots | about 21 | record type of the target entity type (`record-of`) |
| `http-endpoint` (`operation`, `request`, `response`) | 29 | contract of `target` (`operationInputType` already computes it) |
| trait hooks (`derive`, `guard`, `react`, `view`) | 8 | `configuration` has the schema held in `self.data.configuration`; the record is per use, not per trait |
| `message-consumer.handler`, `ownership-scope.filter` | 7 | `handler`: a fixed envelope never declared; `filter`: checked by hand-written JS in `entity-ownership` |
| `process-definition` | 7 (many more in tests) | object built by looping over `entities`, `tasks`, `variables` |

About 58 positions (three families) are covered by a predefined resolver over one or two fields. One kind, `process-definition`, needs a hand-written resolver (`scopeOf`); only inferring its scope from the runtime would need type-level evaluation. Applications other than the demo were not measured.


### 5.4 Status (R3.9)

Built: the forms `@mapping/T`, `@method/T` and `@type/T` (the last in the `input` of a slot), `templates` on a kind, lookup along `extends`, resolution against the fill's target for slots, the problems `unresolved-template`, `invalid-template` and `template-failed`, the resolvers `operation-input`, `operation-output` (core) and `record-of` (entities). In use: `http-endpoint` (`request`, `response`) and `process-definition` (`step-code`, `step-method`, `error-code`; `definitions.js` no longer types anything). Findings of the work:

- A template returns a **compact** schema, not a type; the process scope was rewritten as one (`scopes.js`), which is also shorter than the type it replaces.
- A schema id inside a template's mapping needs the escape (`"\\@http-request"`), since `@name` in a mapping is a variable.
- `schema-of` was not needed: a path to the schema in the data (`#.data.configuration`) is the resolver.
- `unresolved-template` is also reported at the kind (for the names its shape and own slots reach, `shape` and `slots/<slot>/input`), so a kind with no instance is checked; a kind that expects its subkinds to supply a name declares a default.
- The `entity-type` slots `requestGuards`, `resultGuards` and `reactions` are typed by a `@type/viewed-data` hole in `viewed-entity-record`: one hole in a shared schema types every use, and the schema needs no copy. A fill on a **kind** has many entity types as targets: the template is resolved for each instance and the types are united.
- The slots that see the stored record (`eventGroup`, `relations`, `searchIndex`, `searchRows`, `validations`) stay untyped: the stored value of a trait (the timeline of a versioned body) is not its viewed value, and a trait declares only the viewed one. A trait would have to declare its stored schema (Q6).
- The trait hooks (`view`, `guard`, `react`, `derive`) are typed by three templates of `entity-trait`, the `configuration` by the schema the trait declares in its own data (`"!configuration": "#.data.configuration"`, no resolver). The `change` is typed with its record `data` open, since a trait serves every entity type.
- `message-consumer.handler` has the template `handler`, whose input is `object`: a channel declares no schema for its messages. A `message` schema on `message-channel` with a resolver (`message-of`) would type the payload; not built.
- The `operation` mapping of `http-endpoint` has the template `operation-mapping` (`{ params, query, headers, input }`, `input` by the contract of the target), so its unknown paths are reported by the framework; `authorization` keeps the type of the mapping (it needs the values of the dimensions) and no longer reports the paths.
- `@type/T` in a **shape** is a checked value: `validate()` resolves the name for the instance and the value must match (`invalid-element`); in the `output` of an **operation** it types the result of an `invoke` against the element invoked (literal, or bounded by the type of a computed target; a list gives a union). It is not resolved in the code of the kind itself (`self.data`, `input` of its own operations): that code serves every instance, so the hole is any there.
- Open: `after` of a change.

### 5.5 Recommendation

1. Build `templates` with the two forms, lookup along `extends`, recursive resolution, the checks above.
2. Start with the predefined resolvers `record-of`, `operation-input`, `operation-output`, `schema-of`; they cover about 58 positions.
3. Declare the missing fixed inputs (`message-consumer.handler`).
4. Move the process scope to a template (`scopeOf` as the resolver).
5. Inference from the kind's own operations (the earlier option 3) only if the second description of the process scope drifts in practice; it needs constant propagation of `self.data`, dependent results in contracts and, for the process scope, type-level evaluation of `$mapValues`.

Compared with the `scopes` design dropped in section 3: the same idea (a name in the schema, resolved by the kind), but the resolver is an ordinary mapping over `self.data`, there are two forms with a checked result, templates nest and are not limited to `shape`.


## 6. Not covered

- The code of a step extension (a fill of `stepExtensions`) runs in the scope of its target definition and is not typed.
- The scope is described twice: built at run time by `process-scope`, typed by `scopeOf`. They can drift; the long-term answer above removes the second.
