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
| [lifecycle.js](src/lifecycle.js) | `load`/`start`/`stop` hooks |
| [references.js](src/references.js) | element references: an id, or `{ instanceOf: <kind> }` resolved to an instance; bindings |
| [validation.js](src/validation.js) | `validate()` |
| [elements/](elements) | the bootstrap kinds, in data |

## Core elements

Besides the bootstrap kinds: `binding` and the schema `element-ref` (see [Interfaces](#interfaces)), `clock` (`now()` → ISO time, an effect), `entry-point` (manages `trace`), the pure functions `slot-values`, `apply-mapping`, `app-config-section`, `schema-validate`, `is-instance-of`, `instances-of` (the `{ id, kind, data }` of every identified instance of a kind), and the executable `assert-valid` (`{ schemaId, value }`: throws `invalid` with the errors, or returns the value).

## Pipeline rules

- A node has one keyword plus `inputMap` and `outputKey`. The node's own expressions (`set`, `if`, `invoke`, `execute`, …) see the scope it is written in; `inputMap` sets the node's input: what it passes to what it calls or runs (operations, `low`, methods, `forEach` items, branches, `next`). Without `inputMap` the input is the current `#.input`.
- `throw` raises a `CoreError`: a string is its message (code `error`), an object gives `code`, `message` and `data`. In `catch`, `#.error` is that error.
- Outputs (`outputKey`) are local to their sequence: a branch's outputs don't leak out. `set` doesn't merge.
- `return` ends the current method: an operation, hook, middleware method, `call`/`execute` target, template implementation, or the pipeline a wrapper's `next` runs.
- `low` receives `{ input, _ctx }`, with `_ctx` frozen.
- `_ctx` changes only through `withContext`, by a kind that manages the key.

## Validation

`validate()` runs over the loaded elements, on demand (tests, CI, [`bpf-validate`](../tools/README.md)), never on start. It checks kinds, context declarations, instance shapes, slot fills and their order, start order, abstract operations, element references and bindings. It doesn't inspect pipelines or pure function signatures.

## Lifecycle

`load` runs every element's hooks in element id order (load hooks don't depend on each other). `start` orders elements by element id, then by what their kinds declare in `lifecycle`: `startPosition` (`first`, `last`), `startAfter` and `startBefore`, which name kinds and cover all their instances, subkinds included. `stop` runs in reverse start order. A cycle is an error.

The kind `entry-point` manages the context key `trace` (`{ correlation }`) and starts last. Kinds that receive work from outside (`http-endpoint`, `message-consumer`) extend it and bind `trace` next to their own key.

## Interfaces

A kind can declare an operation with a contract (`input`, `output`) and no `implementation`: an abstract operation. A subkind implements it once, with `{ "implementation": … }` only. The contract stays the abstract kind's, so every implementation is checked against it; changing the contract or implementing again is a load error. Invoking an unimplemented operation fails with `unimplemented-operation`, and `validate()` reports instances that leave one unimplemented.

```json
{ "id": "message-broker", "kind": "kind", "data": { "operations": { "unsubscribe": { "input": { "!consumer": "string" } } } } }
{ "id": "nats-broker", "kind": "kind", "data": { "extends": "message-broker", "operations": { "unsubscribe": { "implementation": { "low": … } } } } }
```

Where an element is expected (`invoke`, and data fields typed `@element-ref`), a string is always that element. `{ "instanceOf": "<kind>" }` is whichever instance implements the kind, subkinds included: the instance a `binding` names, else the only instance; none or several unbound instances fail at the call (`no-instance`, `ambiguous-reference`).

```json
{ "invoke": { "instanceOf": "message-outbox" }, "operation": "put" }
{ "kind": "binding", "data": { "abstraction": "message-broker", "instance": "nats" } }
```

Packages reference kinds and don't write bindings; the application binds, or names an instance where it means a specific one (a channel to an external system on another transport). `validate()` checks every reference in data and bindings (the bound element is an instance of the abstraction, one binding per abstraction). In the code of a kind, a reference to a kind without instances is accepted: that path may never run.

## Data composition

An element written with `/data` instead of `data` is composed once at boot, after all elements are registered and before kinds are resolved: `{ "/ref": id }` is the data of another element, `{ "/merge": [...] }` deep merges its items (arrays by index, Q5), `{ "/literal": value }` is taken as written. Referenced elements are composed first; a cycle is an error, and so is an element with both `data` and `/data`.

Code keeps the binding rights of the element it is written in: a pipeline reached through `/ref` has its owner's rights, not the referring element's. Merged objects are copies, so code inside a `/merge` result belongs to the merging element.
