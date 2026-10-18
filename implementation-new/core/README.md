# @business-framework/core

The new core ([refactoring plan](../../design/refactoring-plan.md), phases 1–2), built from [design/examples/f18](../../design/examples/f18/README.md). Behaviour belongs to kinds; the core knows no business concept.

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
| [kinds.js](src/kinds.js) | kind chains, resolved kinds (operations, slots, defaults, context rights), `selfOf`, `instancesOf` |
| [schemas.js](src/schemas.js) | the AJV instance: add at load, compile on first use, contract checks after load |
| [mappings.js](src/mappings.js) | compiled LambdaJSON mappings, `$func/<id>` from `pure-function` elements |
| [slots.js](src/slots.js), [order.js](src/order.js) | slot values; ordering by bands, `after`/`before` |
| [context.js](src/context.js) | code authors, visible context, binding rights (P13) |
| [execution/](src/execution) | pipelines, node executors, templates and wrappers, `invoke` |
| [lifecycle.js](src/lifecycle.js) | `load`/`start`/`stop` hooks |
| [validation.js](src/validation.js) | `validate()` |
| [elements/](elements) | the bootstrap kinds, in data |

## Core elements

Besides the bootstrap kinds: `entry-point` (manages `trace`), the pure functions `slot-values`, `apply-mapping`, `app-config-section`, `schema-validate`, `is-instance-of`, `instances-of` (the `{ id, kind, data }` of every identified instance of a kind), and the executable `assert-valid` (`{ schemaId, value }`: throws `invalid` with the errors, or returns the value).

## Pipeline rules

- A node has one keyword plus `inputMap` and `outputKey`. The node's own expressions (`set`, `if`, `invoke`, `execute`, …) see the scope it is written in; `inputMap` sets the node's input: what it passes to what it calls or runs (operations, `low`, methods, `forEach` items, branches, `next`). Without `inputMap` the input is the current `#.input`.
- `throw` raises a `CoreError`: a string is its message (code `error`), an object gives `code`, `message` and `data`. In `catch`, `#.error` is that error.
- Outputs (`outputKey`) are local to their sequence: a branch's outputs don't leak out. `set` doesn't merge.
- `return` ends the current method: an operation, hook, middleware method, `call`/`execute` target, template implementation, or the pipeline a wrapper's `next` runs.
- `low` receives `{ input, _ctx }`, with `_ctx` frozen and limited to the author's keys.
- `_ctx` changes only through `withContext`, by a kind that manages the key.

## Not yet

- Static checks of code (levels 1 and 2 of Q18): `validate()` checks kinds, context declarations, shapes, slot fills and fill order, not pipelines.
- Pure function signatures aren't checked.

## Lifecycle

`load` runs every element's hooks in element id order (load hooks don't depend on each other). `start` orders elements by element id, then by what their kinds declare in `lifecycle`: `startPosition` (`first`, `last`), `startAfter` and `startBefore`, which name kinds and cover all their instances, subkinds included. `stop` runs in reverse start order. A cycle is an error.

The kind `entry-point` manages the context key `trace` (`{ correlation }`) and starts last. Kinds that receive work from outside (`http-endpoint`, `message-consumer`) extend it and bind `trace` next to their own key; code that propagates a correlation reads `trace`.

## Data composition

An element written with `/data` instead of `data` is composed once at boot, after all elements are registered and before kinds are resolved: `{ "/ref": id }` is the data of another element, `{ "/merge": [...] }` deep merges its items (arrays by index, Q5), `{ "/literal": value }` is taken as written. Referenced elements are composed first; a cycle is an error, and so is an element with both `data` and `/data`.

Code keeps the rights (P13) of the element it is written in: a pipeline reached through `/ref` has its owner's rights, not the referring element's. Merged objects are copies, so code inside a `/merge` result belongs to the merging element.
