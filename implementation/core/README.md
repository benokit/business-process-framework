# @business-framework/core

Elements, kinds and their execution. Behaviour belongs to kinds; the core knows no business concept.

**Why it is built this way.** Business logic written as data (JSON trees, never code strings) can be read, diffed and audited, and a tool can answer questions about it without running it: which effects an operation has, who references an element, whether every expression fits the data it receives. Everything below serves that: kinds and interfaces keep behaviour swappable, scoped context keeps cross-cutting values (user, transaction) out of signatures, effects make side effects visible, and `validate()` turns the declarations into checks.

## API

```js
import { boot, start, stop, invoke, validate } from '@business-framework/core';

await boot({ paths: ['./elements'], elements: [] }); // load: core elements + yours, then the 'load' hooks
await start();                                         // 'start' hooks
await invoke('hello', 'greet', 'Ada');                 // an operation of the element's kind chain
validate();                                            // on demand: a list of problems, [] when valid; { warnings: true } adds warnings
packageElements('@business-framework/logging');       // the elements directory of an installed package
execute({ method, input, self, _ctx });               // runs a method value from native code, as the execute node does
interpret({ stubs, effects });                         // replaces effects, see Interpreters; boot resets it to production
```

Errors are `CoreError` with `code`, `message`, `data` and optionally a `cause`. An error that escapes collects its route in `data.frames`, outermost first: `<element>.<operation>` per `invoke`, the id of a slot fill or node template whose code runs, and `step <n> <keyword>` (or `step <n> inputMap`) per node; nothing is recorded on success. A `low` module's foreign error becomes `low-failed` (`data.module`, `data.export`, `cause`). `describeError` renders `code: message` and the route. Values are never put in `data` by the framework (`invalid` names schema and paths only); HTTP responses carry code, message and correlation only; the [http-server](../platform/http-server/README.md) and the NATS consumer log the route.

## Modules

| Module | Owns |
|---|---|
| [registry.js](src/registry.js) | elements by id, `memo`/`lazy` caches cleared by `reset` |
| [loader.js](src/loader.js) | reading `.eson` files |
| [data.js](src/data.js) | data composition: `/data` with `/ref`, `/merge`, `/literal`, evaluated once at boot |
| [kinds.js](src/kinds.js) | kind chains, resolved kinds (operations, slots, fixed values, managed context), `selfOf`, `selfAt`, `levelsOf` (the data of an instance per kind), `instancesOf` |
| [schemas.js](src/schemas.js) | the AJV instance: add at load, compile on first use, contract checks after load |
| [mappings.js](src/mappings.js) | compiled LambdaJSON mappings, `$func/<id>` from `pure-function` elements |
| [slots.js](src/slots.js), [order.js](src/order.js), [discriminators.js](src/discriminators.js) | slot values; ordering by bands, `after`/`before`; the variants of a slot's discriminator |
| [context.js](src/context.js) | code authors, binding rights |
| [execution/](src/execution) | pipelines, node executors, templates and wrappers, `invoke`, the interpreter |
| [lifecycle.js](src/lifecycle.js) | `load`/`start`/`stop` hooks (the `validate` and `explain` hooks belong to the analysis) |
| [settings.js](src/settings.js) | the effective settings of an element: defaults, `app-config`, environment; checked at start |
| [references.js](src/references.js) | element references: an id, or `{ instanceOf: <kind> }` resolved to an instance; bindings |
| [primitives.js](src/primitives.js) | the LambdaJSON primitives, read from `lambdajson-js` |
| [elements/](elements) | the bootstrap kinds, in data |

Static analysis, in [analysis/](src/analysis): it reads the loaded elements and never runs them (`validate()` and what tools read).

| Module | Owns |
|---|---|
| [validation.js](src/analysis/validation.js) | `validate()` |
| [code.js](src/analysis/code.js) | finding code in elements, the checks of code in `validate()` |
| [data-flow.js](src/analysis/data-flow.js) | the types flowing through methods and the checks of every expression in `validate()` |
| [effect-inference.js](src/analysis/effect-inference.js) | the effects of operations and slot fills, inferred from `low` nodes, and their bounds |
| [settings.js](src/analysis/settings.js) | the checks of settings declarations and app-config in `validate()`, the settings an element has available |
| [explanations.js](src/analysis/explanations.js) | the `lifecycle.explain` sections of an element |
| [introspection.js](src/analysis/introspection.js) | what tools read: elements and their source files, resolved kinds, slot fills, node forms ([forms.js](src/execution/nodes/forms.js)), the references of an element, the effects of an operation |

## Core elements

Besides the bootstrap kinds:

| Element | Is |
|---|---|
| `binding` | names the instance of an abstraction ([Interfaces](#interfaces)) |
| `effect`, `element-ref`, `ref` | schemas ([Effects](#effects), [Interfaces](#interfaces)) |
| `clock` | `now()` → ISO time, an effect |
| `entry-point` | manages `trace`, starts last ([Lifecycle](#lifecycle)) |
| `ajv` | the schema registry: `add` schemas, `assert` `{ schemaId, value }` (throws `invalid` with the errors, else returns the value) |
| `$func/slot-values`, `apply-mapping`, `schema-validate`, `is-instance-of` | pure functions over slots, mappings, schemas and kinds |
| `$func/settings` | `id` → the effective [settings](#settings) of an element |
| `$func/has-operation` | `{ element, operation }`; true for an unknown element, which the reference check reports |
| `$func/instance-methods` | `{ kind, property }` → `[{ id, method }]`, the method held in `property` of the data of each identified instance of a kind that has one; a driver runs them with `execute`, and the inference counts the effects of the methods an operation lists this way |
| `$func/changes-of` | `{ element, operation }` → the operation's `write` and `irreversible` effects as `"<effect>: <trace>"` ([Effects](#effects)) |
| `$func/instances-of` | the `{ id, kind, data }` of every identified instance of a kind |
| `$func/kind-chain` | the kinds above an element, nearest first (an instance's chain, a kind's ancestors); `[]` for an unknown id |

## Pipeline rules

- A node has one keyword plus `inputMap` and `outputKey`. The node's own expressions (`set`, `if`, `invoke`, `execute`, …) see the scope it is written in (in an operation and in a template's implementation that includes `#.operation`, the name of the operation that runs); `inputMap` sets the node's input: what it passes to what it calls or runs (operations, `low`, methods, branches, `next`). Without `inputMap` the input is the current `#.input`.
- `forEach` runs its body once per item of its input, with the item as `#.item`; the body keeps the scope it is written in, `#.input` included.
- `throw` raises a `CoreError`: a string is its message (code `error`), an object gives `code`, `message` and `data`. In `catch`, `#.error` is that error.
- Outputs (`outputKey`) are local to their sequence: a branch's outputs don't leak out. `set` doesn't merge.
- `return` ends the current method: an operation, hook, middleware method, `execute` target, template implementation, or the pipeline a wrapper's `next` runs.
- `low` names a JS function as `{ module, export }` (the schema `js-export`) with its `effects` (see [Effects](#effects)) and calls it with `{ input, _ctx }`, `_ctx` frozen.
- A mapping that doesn't compile, or fails while it runs (`missing-operand`: arithmetic or ordering on a missing value), fails with a `CoreError` whose code is the language's and whose `data.path` points into the mapping; `validate()` finds a mapping that doesn't compile before it runs.
- A `pure-function` is `$func/<id>`: either a JS function (`module`, `export`) or a LambdaJSON `mapping`, beside its `signature`.
- `_ctx` changes only through `withContext`, by a kind that manages the key.
- A package adds a keyword with an `execution-node-template` (`{ keyword, node?, effects?, implementation }`): the implementation runs with the node as `#.node` and the node's input as `#.input`; an `execution-node-wrapper` also gets `next`, which runs the keyword's value as a pipeline. `node` is the CJSL shape of the node's keys besides `inputMap` and `outputKey`, typing code (`@method`, `@mapping`) and references (`@ref/<kind>`) in it, so that `validate()` checks the node, its code and its references. A template with `within: <kind>` is valid only in the operations of a kind extending `<kind>` (and in the implementation of a template with the same `within`); anywhere else `validate()` reports `node-outside-context`. An operation declared `private` can be invoked only by the operations and templates running for the same element (`private-operation` otherwise, also for a call from outside the pipeline).
- `invoke` checks the input and output against the operation's contract. A compiled check costs well under a microsecond, even for a full entity record, so contracts are not a performance concern.

## Validation

Declarations are only worth something if they are checked, and checking a whole application (including code paths no test runs) must not slow or endanger a start. So `validate()` runs over the loaded elements on demand (tests, CI, [`bpf validate`](../tools/README.md)), never on start. It checks kinds, context declarations, instance shapes, slot fills and their order, start order, abstract operations, element references and bindings, and the code. Code is what a shape types `@method` or `@mapping`, in an element's data or in a slot fill's value; a problem in it names the element and the path to the node. In methods: each node has one keyword ([forms.js](src/execution/nodes/forms.js) or a node template) and only that keyword's keys, matching the template's `node` shape, whose code and references are checked like the element's; no `outputKey: "_ctx"`; no `next` in an operation, a `load`/`start`/`stop` hook or a plain template's implementation, where no middleware runs; literal `invoke` targets and operations exist; `low` modules resolve; `withContext` binds only keys the author's kind manages. In methods and mappings: a literal slot of `$func/slot-values` is declared (for `#.self.id`, on the kind the code runs for), and every expression is checked by its [data flow](#data-flow). Computed values (`"invoke": "#.self.data.broker"`) are checked at run time only, and so are `low` exports.

A kind adds its own checks with `lifecycle.validate`: a mapping from `#.self` to a list of problem messages, run for each identified instance, subkinds included. Any message is reported as `invalid-element`; a message `{ "warning": "…" }` is reported as a warning.

A kind adds to what [`bpf explain`](../tools/README.md) shows of any element with `lifecycle.explain`: a mapping from `{ self, element }` (the explained element's id) to an object of sections (or `null`), run for each identified instance; the sections of all of them are merged (`explanationsOf(id)` of `@business-framework/core/introspection`).

`validate()` also checks [effects](#effects); where problems found by the other checks keep the effects from being inferred, it reports those problems only.

## Data flow

A misspelled path in a mapping would otherwise fail only when that branch runs in production. `validate()` therefore infers every expression with `infer` of `lambdajson-js` from the type of the scope it is written in, walking each method as the executor runs it ([data-flow.js](src/analysis/data-flow.js)). A node's expressions see `{ input, self, _ctx }`, the `outputKey`s before the node in its sequence, `item` in `forEach`, `error` in `catch` and `node` in a template's implementation; branches get the node's input; a wrapper's pipeline runs in the enclosing scope, a method in another template's node in a scope of its own. The types come from the schemas: `input` from the operation's contract (`null` in `load`/`start`/`stop`, the `input` a slot declares in its fills, any in other data), `self` from the shape of the kind that owns the code (the nearest declared one up the chain; of the target's kind in a slot fill), `_ctx` from the keys kinds manage, the output of an `invoke` from the contract of a literal target or `#.self.id`, the output of `set` from its expression, the output of a template node from what its implementation returns (for a wrapper, `next` returns what the pipeline it runs returns); a method's type includes its `return`s. `$func/<id>` is typed by its `signature`, `$func/slot-values` with a literal slot by the slot's value; a reference `@ref/<kind>` is the ids of the kind's instances, or `{ instanceOf }` of the kind or a subkind. A `lifecycle.validate` mapping gets `{ self }`, a pure function's mapping the input of its signature. A slot declares the input of its fills' code with `input` (a schema), beside `cardinality`, `value` and `effects`. A package whose kind gives a mapping a scope only it knows types it itself: `mappingType(code, input, expected?)` of `@business-framework/core/data-flow` infers a mapping from a type (with `expected`, a schema, it also reports where the result isn't one: `type-mismatch`, `missing-property`, `unknown-property`), `operationInputType({ element, operation })` is the type of an operation's input contract ([authorization](../services/authorization/README.md) types endpoint operations this way).

The scope, the objects built in code and every schema object that declares properties are closed for inference; a map (`"name{}"`, `"{…}"`), an object with `"*"` and `object` stay open for keys they don't declare. So code reads only what its contract or shape declares, and a misspelled scope, output, context or data key is certain. Run time is unchanged: a schema accepts keys it doesn't declare unless it closes the object itself (`"*": "never"`). A problem carries the code of `infer` (`unknown-path`, `unknown-variable`, `type-mismatch`, `wrong-argument-count`, and `lint`'s: `unknown-function`, `mixed-call`, `unknown-parameter`, …) at the path of the call. An `invoke` whose target is computed (`"#.input.trait"`) is typed by the instances its type can name (`@ref/<kind>`): its output is the union of their output contracts, and an operation none of them has is the warning `unknown-operation`. Warnings (`possibly-missing-operand`, `impossible-comparison`, `needless-escape`, `unknown-operation` of a computed target) have `data.severity: 'warning'` and are returned by `validate({ warnings: true })` only.

## Effects

Without knowing what an operation can change, nobody can tell whether it is safe in a guard, in a `GET`, or inside a transaction. Effects happen only in `low` nodes, so only a `low` node declares them: `"low": { "module": …, "export": …, "effects": [ … ] }`, a list of these classes (the schema `effect`); `validate()` reports a `low` node without it (`undeclared-effects`). The classes are what other parts of the system need to know about an effect:

| Effect | Means | Examples | Matters to |
|---|---|---|---|
| `read` | observes state, or a value that varies between runs | entity store reads, cache get, search, the clock, generated ids | nothing: allowed everywhere |
| `write` | changes state that the enclosing transaction undoes on rollback | entity store writes, the outbox insert | code that may change nothing (`guards`, `GET` targets) |
| `irreversible` | changes state that no transaction undoes | broker publish, cache set, search index, a sequence number, a statement on its own connection | code inside a transaction, and code that may change nothing |
| `trace` | diagnostic output nothing reads back | `log` | nothing: ignored by every bound |

An empty list means the function changes and observes nothing outside its input (`afterCommit` only hands its pipeline over).

Everything else is inferred, per instance after boot: an operation has the effects of everything it reaches: its `low` nodes, the operations it invokes, the implementations of its template nodes and the code they run, an `execute` of a method in `#.self`, and the methods in the fills of a slot where it reads them with `$func/slot-values` (the value, or its fields, typed `@method`). Targets and conditions on `#.self` or `#.node` are evaluated for the instance, so a channel with `publisher.transactionalOutbox` reaches the outbox, not the broker. A target `#.input.<field>` that the contract types `@ref/<kind>` stands for every instance of the kind; any other computed target stands for the elements its inferred type names ([data flow](#data-flow)), and counts as `read`, `write` and `irreversible` when the type names none. Each effect carries a trace of how it is reached (`outbox.put > afterCommit > outbox.deliverNow > outbox.claim > low claim`).

Declaring only at the leaves and inferring upward means a declaration can't go stale. Bounds constrain what is inferred, they never declare it:

- A template's `effects.bound` lists the effects its code may have (`inTransaction`: `read`, `write`, `trace`).
- A template with `effects.defers` runs its code after the enclosing scope ends (`afterCommit`): its effects don't count against an enclosing bound, but they count for the operation.
- A slot's `effects` lists the effects its fills may have (`requestGuards`: `read`, `trace`).
- A kind checks more in its `validate` hook with `$func/changes-of` (`http-endpoint`: a `GET` target changes nothing).

A bound that inference contradicts is an `effect-bound` problem with the trace. [`bpf explain`](../tools/README.md) shows the effects of every operation of an instance. Operations that reach each other in a cycle get the effects of the whole cycle. Not seen: what a computed `execute` runs (other than slot fills read with `$func/slot-values`).

## Interpreters

A test should never reach a database or broker by accident. The interpreter decides which effects run: production runs all of them, and `interpret({ stubs, effects })` sets another one, for tests:

- `effects`: the effect classes a `low` node may have (default: all). A `low` node with another class, or with none declared, fails with `stubbed-effect`, naming the node and its element, so a test never reaches a database or broker it didn't stub.
- `stubs`: `{ <element or kind id>: { <operation>: ({ input, _ctx }) => output } }`. `invoke` runs the stub instead of the operation, the element's own stub before its kind chain's, from the most specific kind. The contract still applies: the input and output of a stub are checked like the operation's.

`traced(run, { skip? })` runs `run` and returns `{ result | error, spans }`: a tree of `{ label, children, ms, error? }` spans, one per frame (the labels of `data.frames`): operations, slot fills, node templates and steps, and a `{ label: 'low <export>', effects, skipped? }` leaf for each `low` node. It decorates the one place frames are made (`framing.around`) and the `low` check for the duration of the run, so an untraced run executes the same code with nothing added. `skip` lists effect classes (`['write', 'irreversible']` is a dry run): a `low` node with one of them is not run and answers `null`, so what depends on its answer fails or differs; a `low` node that declares no effects counts as having all. Values are never recorded.

A stub replaces an operation, never a `low` node: it follows the operation's contract, not the input of a JS function. An effect is therefore stubbable only together with the operation it runs in, so a `low` node whose effect a test replaces is best the whole implementation of its operation (`clock.now`, `message-channel.envelope`). `boot` resets the interpreter to production.

```js
interpret({ effects: ['trace'], stubs: { transaction: { begin: () => ({ sessionId: 1 }), commit: () => null }, 'entity-database': { create: ({ input }) => ({ ...input, id, revision: 1, timestampUtc }) } } });
```

## Slots

A slot is declared by a kind (or by a `slot-declaration` for a kind that is not yours) with a `cardinality`, the schema of a fill's `value` and, for code, the `input` its fills see. A fill is selected by its `target`, the kinds and instance it contributes to, and ordered by `position`, `after` and `before`.

A `many` slot whose `input` is a tagged union names its `discriminator`, the property that tells the variants apart; its values (an enum, or a `const` in each branch of a one-of) are the slot's variants. A fill says which variants it handles with `on` (without it, all), `$func/slot-values` takes `on` and returns the fills that handle it, in the order of the whole slot, and `validate` checks `on` against the variants. The input of a fill's code is narrowed to the variants it is on, so a path none of them has is an `unknown-path`; a path some of them have is `value | null`.

## Lifecycle

Infrastructure must be ready before what uses it and receive work last, so start order is declared by kinds, not by file order. `load` runs every element's hooks in element id order (load hooks don't depend on each other). `start` orders elements by element id, then by what their kinds declare in `lifecycle`: `startPosition` (`first`, `last`), `startAfter` and `startBefore`, which name kinds and cover all their instances, subkinds included. `stop` runs in reverse start order. A cycle is an error.

The kind `entry-point` manages the context key `trace` (`{ correlation }`) and starts last. Kinds that receive work from outside (`http-endpoint`, `message-consumer`) extend it and bind `trace` next to their own key.

## Interfaces

Callers should depend on what something does, not on what implements it, so a database or broker can change without touching the code that uses it. A kind can declare an operation with a contract (`input`, `output`) and no `implementation`: an abstract operation. A subkind implements it once, with `{ "implementation": … }` only. The contract stays the abstract kind's, so every implementation is checked against it; changing the contract or implementing again is a load error. Invoking an unimplemented operation fails with `unimplemented-operation`, and `validate()` reports instances that leave one unimplemented.

```json
{ "id": "message-broker", "kind": "kind", "data": { "operations": { "unsubscribe": { "input": { "!consumer": "string" } } } } }
{ "id": "nats-broker", "kind": "kind", "data": { "extends": "message-broker", "operations": { "unsubscribe": { "implementation": { "low": … } } } } }
```

Where an element is expected (`invoke`, and data fields typed `@element-ref` or `@ref/<kind>`), a string is always that element. References are typed like paths: `@ref` is any element; `@ref/<kind>` (generated for every kind) an instance of the kind, or `{ instanceOf }` of the kind or a subkind; `@ref/kind` a kind; `@ref/kind/<kind>` a kind that is or extends `<kind>`. `validate()` checks every typed reference in element data, slot fills and template nodes. A value that is neither a string nor `{ instanceOf }` is no reference, so a position that may hold either (`{ "$data#": ["@ref/<kind>", "@fill"] }`) is checked as a reference only when the value is one. `{ "instanceOf": "<kind>" }` is whichever instance implements the kind, subkinds included: the instance a `binding` names, else the only instance; none or several unbound instances fail at the call (`no-instance`, `ambiguous-reference`).

A position of an operation's input that the contract types `@ref` or `@ref/<kind>` reaches the body resolved: after the contract check `invoke` replaces `{ instanceOf }` with the id of the instance (`no-instance` and `ambiguous-reference` come from `invoke`, before the body), and the data flow types it, in the body, as the ids of the kind's instances (a caller may still pass either form). References in element data and slot fills stay as written.

```json
{ "invoke": { "instanceOf": "message-outbox" }, "operation": "put" }
{ "kind": "binding", "data": { "abstraction": "message-broker", "instance": "default-nats-broker" } }
```

Packages reference kinds and don't write bindings, so a reusable package never decides for the application; the application binds, or names an instance where it means a specific one (a channel to an external system on another transport). `validate()` checks every reference in data and bindings (the bound element is an instance of the abstraction, one binding per abstraction). A reference in code only has to name a kind, because that path may never run; a kind whose configuration selects such a path checks for the instance in its `validate` hook (a channel with `publisher.transactionalOutbox` needs a `message-outbox`).

## Settings

Tuning (ports, timeouts, URLs) belongs to a deployment, not to the logic, so the kind declares it once and a deployment overrides it from outside without editing elements. What a deployment tunes is declared by the kind: `settings: { shape, defaults }` (the shape is a schema of primitive leaves, camelCase names, lists of primitives and maps of primitives; variants are selected by an enum, the mode). `$func/settings` of an element id returns its effective settings: the defaults of the kind chain, then the `app-config` sections named by the ids of the chain and the element, then the environment variables `BPF__<id>__<path>` of the same ids (`-` of an id becomes `_`, path steps are separated by `__`; values are converted by the shape: integers, numbers, booleans, comma-separated lists). The source ranks above the specificity, and objects merge while everything else replaces. `start()` checks the settings of every element, and `validate()` reports settings shapes that can't be set from the environment (`settings-shape`) and warns about an `app-config` section or `BPF__…` variable that matches nothing (`unknown-settings-section`, `unknown-settings-variable`, `unknown-setting`); an invalid setting fails with `invalid-settings`, naming the layers searched.

```json
{ "id": "http-server", "kind": "kind", "data": { "settings": { "shape": { "port": "integer" }, "defaults": { "port": 3000 } } } }
```

`BPF__http_server__port=8080` or an `app-config` element `{ "http-server": { "port": 8080 } }` sets it.

## Fixed values

A kind's `fixed` states what is true of every instance (a query's `provider` is `database`), so instances needn't repeat it and can't contradict it. It is data its instances have and no child or instance changes. The values of the chain are united deeply (up to the next kind with a [mapping](#shapes-and-mappings)), and so are an instance's own data: the same path with a different value fails (`fixed-conflict`, reported by `validate()` and at load), an equal value is accepted. The fill-in happens before the shape is checked, so a required property a kind fixes needn't be written by its instances. A kind has no `defaults`: deployment tuning is configuration, and a schema is composed with its own primitives (`$data#&`).

```json
{ "id": "query", "kind": "kind", "data": { "extends": "integration", "fixed": { "provider": "database" } } }
```

## Shapes and mappings

A kind's `shape` is the shape of its instances' data, and the code of the kind (its operations and hooks) sees exactly that data as `#.self.data`; a slot fill sees the data at the level of its `target` kind (of the instance's own kind when the target is the instance), wherever the operation that runs it is implemented. A kind that extends another and declares no `mapping` has its parent's shape: declaring one again is `redundant-shape` (a kind none of whose ancestors declares a shape may declare the first), and shapes are never composed. A `mapping` from `{ id, data }` of the kind to its parent's shape lets a subkind use a vocabulary of its own.

A subkind with a vocabulary of its own writes the mapping once, and its instances use that vocabulary (here `labelled` instances are read by the code of `named` as `{ name }`):

```json
[
    { "id": "named", "kind": "kind", "data": { "shape": { "!name": "string" } } },
    { "id": "labelled", "kind": "kind", "data": { "extends": "named", "shape": { "!label": "string" }, "mapping": { "name": "#.data.label" } } },
    { "id": "ada", "kind": "labelled", "data": { "label": "Ada" } }
]
```

An instance is authored in the shape of its kind and is represented once per kind of the chain: the data go down the chain through the mappings (run once at boot, pure, memoized per instance) and each kind's code sees the representation of its own kind (`selfAt(element, kind)`: an operation at the kind that implements it, a lifecycle hook and `lifecycle.validate`/`explain` at their kind, the fills of a slot at the kind that declares it). `fixed` is united with the data of its level, and a kind's mapping ends the run of kinds whose fixed values are united: a result of the mapping that differs from the parent's `fixed` is `fixed-conflict`.

`validate()` checks the data of each level against the shape of its kind (a level reached through a mapping says so in the message), the result of each mapping against the parent's shape (`type-mismatch`, `missing-property`, `unknown-property`) and the paths in it against its own shape. A mapping that fails for an instance is `mapping-failed`, naming the instance and the kind; a problem found in a mapped level refers to the paths of that level's data. Native code reads an instance as a kind sees it: `selfAt(element, kind)`, and `selvesOf(kind)` and `instanceMethods` give the instances of a kind with their data at the level of that kind (`selfOf` is the most derived level, for code that knows the instance's own kind). `bpf explain` shows the `levels` of an instance and the `mappings` of a kind ([tools](../tools/README.md)).

## Data composition

Elements often differ from another only in a few keys; composing them avoids copies that drift apart. An element written with `/data` instead of `data` is composed once at boot, after all elements are registered and before kinds are resolved: `{ "/ref": id }` is the data of another element (`{ "/ref": "<id>/<key>/<key>" }` is the value at that path inside it; a path with no value fails with `unknown-ref-path`), `{ "/merge": [...] }` composes its items left to right: objects merge by key, everything else (arrays included) is replaced, `{ "/replace": v }` replaces as a whole, `{ "/unset": true }` removes the key and `{ "/append": [...] }` adds to an array; the markers are resolved at the end of the `/merge` (an invalid combination fails with `composition-type`), `{ "/literal": value }` is taken as written, `{ "/uri": uri }` is the text of a file: `<package>/<path>` inside an installed package (`@business-framework/entities-postgresql/sql/entities-table.sql`), or a `file:` URL. A file that can't be read fails the boot (`unreadable-uri`). Referenced elements are composed first; a cycle is an error, and so is an element with both `data` and `/data`.

Code keeps the binding rights of the element it is written in: a pipeline reached through `/ref` has its owner's rights, not the referring element's. Merged objects are copies, so code inside a `/merge` result belongs to the merging element.
