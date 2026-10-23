# @business-framework/core

Elements, kinds and their execution. Behaviour belongs to kinds; the core knows no business concept.

## API

```js
import { boot, start, stop, invoke, validate } from '@business-framework/core';

await boot({ paths: ['./elements'], elements: [] }); // load: core elements + yours, then the 'load' hooks
await start();                                         // 'start' hooks
await invoke('hello', 'greet', 'Ada');                 // an operation of the element's kind chain
validate();                                            // on demand: a list of problems, [] when valid
packageElements('@business-framework/logging');       // the elements directory of an installed package
execute({ method, input, self, _ctx });               // runs a method value from native code, as the execute node does
```

Errors are `CoreError` with `code`, `message` and `data`.

## Modules

| Module | Owns |
|---|---|
| [registry.js](src/registry.js) | elements by id, `memo`/`lazy` caches cleared by `reset` |
| [loader.js](src/loader.js) | reading `.eson` files |
| [data.js](src/data.js) | data composition: `/data` with `/ref`, `/merge`, `/literal`, evaluated once at boot |
| [kinds.js](src/kinds.js) | kind chains, resolved kinds (operations, slots, defaults, managed context), `selfOf`, `instancesOf` |
| [schemas.js](src/schemas.js) | the AJV instance: add at load, compile on first use, contract checks after load |
| [mappings.js](src/mappings.js) | compiled LambdaJSON mappings, `$func/<id>` from `pure-function` elements |
| [slots.js](src/slots.js), [order.js](src/order.js) | slot values; ordering by bands, `after`/`before` |
| [context.js](src/context.js) | code authors, binding rights |
| [execution/](src/execution) | pipelines, node executors, templates and wrappers, `invoke` |
| [lifecycle.js](src/lifecycle.js) | `load`/`start`/`stop` hooks (`validate` hooks run in [validation.js](src/validation.js)) |
| [references.js](src/references.js) | element references: an id, or `{ instanceOf: <kind> }` resolved to an instance; bindings |
| [validation.js](src/validation.js) | `validate()` |
| [code.js](src/code.js) | finding code in elements, the checks of code in `validate()` |
| [primitives.js](src/primitives.js) | the LambdaJSON primitives, read from `lambdajson-js` |
| [introspection.js](src/introspection.js) | what tools read: elements and their source files, resolved kinds, slot fills, node forms ([forms.js](src/execution/nodes/forms.js)) |
| [elements/](elements) | the bootstrap kinds, in data |

## Core elements

Besides the bootstrap kinds: `binding` and the schemas `element-ref` and `ref` (see [Interfaces](#interfaces)), `clock` (`now()` → ISO time, an effect), `entry-point` (manages `trace`), the pure functions `slot-values`, `apply-mapping`, `app-config-section`, `schema-validate`, `is-instance-of`, `has-operation` (`{ element, operation }`; true for an unknown element, which the reference check reports), `instances-of` (the `{ id, kind, data }` of every identified instance of a kind). The schema registry `ajv` adds schemas (`add`) and checks values (`assert`, `{ schemaId, value }`: throws `invalid` with the errors, or returns the value).

## Pipeline rules

- A node has one keyword plus `inputMap` and `outputKey`. The node's own expressions (`set`, `if`, `invoke`, `execute`, …) see the scope it is written in; `inputMap` sets the node's input: what it passes to what it calls or runs (operations, `low`, methods, branches, `next`). Without `inputMap` the input is the current `#.input`.
- `forEach` runs its body once per item of its input, with the item as `#.item`; the body keeps the scope it is written in, `#.input` included.
- `throw` raises a `CoreError`: a string is its message (code `error`), an object gives `code`, `message` and `data`. In `catch`, `#.error` is that error.
- Outputs (`outputKey`) are local to their sequence: a branch's outputs don't leak out. `set` doesn't merge.
- `return` ends the current method: an operation, hook, middleware method, `execute` target, template implementation, or the pipeline a wrapper's `next` runs.
- `low` names a JS function as `{ module, export }` (the schema `js-export`) and calls it with `{ input, _ctx }`, `_ctx` frozen.
- A `pure-function` is `$func/<id>`: either a JS function (`module`, `export`) or a LambdaJSON `mapping`, beside its `signature`.
- `_ctx` changes only through `withContext`, by a kind that manages the key.
- A package adds a keyword with an `execution-node-template` (`{ keyword, node?, implementation }`): the implementation runs with the node as `#.node` and the node's input as `#.input`; an `execution-node-wrapper` also gets `next`, which runs the keyword's value as a pipeline. `node` is the CJSL shape of the node's keys besides `inputMap` and `outputKey`, typing code (`@method`, `@mapping`) and references (`@ref/<kind>`) in it, so that `validate()` checks the node, its code and its references.
- `invoke` checks the input and output against the operation's contract. A compiled check costs well under a microsecond, even for a full entity record, so contracts are not a performance concern.

## Validation

`validate()` runs over the loaded elements, on demand (tests, CI, [`bpf validate`](../tools/README.md)), never on start. It checks kinds, context declarations, instance shapes, slot fills and their order, start order, abstract operations, element references and bindings, and the code. Code is what a shape types `@method` or `@mapping`, in an element's data or in a slot fill's value; a problem in it names the element and the path to the node. In methods: each node has one keyword ([forms.js](src/execution/nodes/forms.js) or a node template) and only that keyword's keys, matching the template's `node` shape, whose code and references are checked like the element's; no `outputKey: "_ctx"`; no `next` in an operation, a `load`/`start`/`stop` hook or a plain template's implementation, where no middleware runs; literal `invoke` targets and operations exist; `low` modules resolve; `withContext` binds only keys the author's kind manages. In methods and mappings: every `$` function is a LambdaJSON primitive, a function its `$let` declares, or a `$func/<id>` of a `pure-function`; a literal slot of `$func/slot-values` is declared (for `#.self.id`, on the kind the code runs for). Computed values (`"invoke": "#.self.data.broker"`) are checked at run time only, and so are `low` exports, pure function signatures and the data flowing between nodes.

A kind adds its own checks with `lifecycle.validate`: a mapping from `#.self` to a list of problem messages, run for each identified instance, subkinds included. Any message is reported as `invalid-element`.

## Lifecycle

`load` runs every element's hooks in element id order (load hooks don't depend on each other). `start` orders elements by element id, then by what their kinds declare in `lifecycle`: `startPosition` (`first`, `last`), `startAfter` and `startBefore`, which name kinds and cover all their instances, subkinds included. `stop` runs in reverse start order. A cycle is an error.

The kind `entry-point` manages the context key `trace` (`{ correlation }`) and starts last. Kinds that receive work from outside (`http-endpoint`, `message-consumer`) extend it and bind `trace` next to their own key.

## Interfaces

A kind can declare an operation with a contract (`input`, `output`) and no `implementation`: an abstract operation. A subkind implements it once, with `{ "implementation": … }` only. The contract stays the abstract kind's, so every implementation is checked against it; changing the contract or implementing again is a load error. Invoking an unimplemented operation fails with `unimplemented-operation`, and `validate()` reports instances that leave one unimplemented.

```json
{ "id": "message-broker", "kind": "kind", "data": { "operations": { "unsubscribe": { "input": { "!consumer": "string" } } } } }
{ "id": "nats-broker", "kind": "kind", "data": { "extends": "message-broker", "operations": { "unsubscribe": { "implementation": { "low": … } } } } }
```

Where an element is expected (`invoke`, and data fields typed `@element-ref` or `@ref/<kind>`), a string is always that element. References are typed like paths: `@ref` is any element; `@ref/<kind>` (generated for every kind) an instance of the kind, or `{ instanceOf }` of the kind or a subkind; `@ref/kind` a kind; `@ref/kind/<kind>` a kind that is or extends `<kind>`. `validate()` checks every typed reference in element data, slot fills and template nodes. `{ "instanceOf": "<kind>" }` is whichever instance implements the kind, subkinds included: the instance a `binding` names, else the only instance; none or several unbound instances fail at the call (`no-instance`, `ambiguous-reference`).

```json
{ "invoke": { "instanceOf": "message-outbox" }, "operation": "put" }
{ "kind": "binding", "data": { "abstraction": "message-broker", "instance": "nats" } }
```

Packages reference kinds and don't write bindings; the application binds, or names an instance where it means a specific one (a channel to an external system on another transport). `validate()` checks every reference in data and bindings (the bound element is an instance of the abstraction, one binding per abstraction). A reference in code only has to name a kind, because that path may never run; a kind whose configuration selects such a path checks for the instance in its `validate` hook (a channel with `publisher.transactionalOutbox` needs a `message-outbox`).

## Data composition

An element written with `/data` instead of `data` is composed once at boot, after all elements are registered and before kinds are resolved: `{ "/ref": id }` is the data of another element, `{ "/merge": [...] }` deep merges its items (arrays by index, Q5), `{ "/literal": value }` is taken as written. Referenced elements are composed first; a cycle is an error, and so is an element with both `data` and `/data`.

Code keeps the binding rights of the element it is written in: a pipeline reached through `/ref` has its owner's rights, not the referring element's. Merged objects are copies, so code inside a `/merge` result belongs to the merging element.
