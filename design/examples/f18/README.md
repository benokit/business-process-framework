# F18 example: behaviour belongs to the kind

A hypothetical but complete scenario for [critique F18](../../critique.md), built from real cases in this codebase. Nothing here is loaded by the runtime.

## Reading order

| File | Shows |
|---|---|
| [01-bootstrap-kinds.eson](01-bootstrap-kinds.eson) | The fixed point `kind`; the bootstrap kinds (`data`, `schema`, `schema-registry` with its instance `ajv`, `executable`, `pure-function`, `execution-node-template`, `slot-declaration`, `slot-fill`); `$func/slot-values`; and `on-startup` and `http-endpoint`, which are special cases today |
| [02-entity-type.eson](02-entity-type.eson) | `entity-type` as a kind: shape, slots, operations using `#.self`, slot values used three ways (run once, run in order, run as middleware), and a `load` hook |
| [03-insurance-contracts.eson](03-insurance-contracts.eson) | A class (`insurance-contract extends entity-type`) with defaults; two instances; fills at class level and instance level; an HTTP route |
| [04-users.eson](04-users.eson) | A singleton (`password-hasher` with its instance `password`); a subkind that adds an operation (`user-account.set-password`); `ensureAdminUser` as an `on-startup` element |
| [05-entity-events.eson](05-entity-events.eson) | A package contributing a reaction to every entity type |
| [06-entity-relations.eson](06-entity-relations.eson) | A package adding a method slot to a kind it doesn't own (`relations` on `entity-type`, P11), its consumer (a `reactions` fill), and one entity type's rule |
| [07-authorization.eson](07-authorization.eson) | A guard from another package that must run `first`, ahead of guards it doesn't know about |
| [08-search-index.eson](08-search-index.eson) | A **data** slot (`searchIndex`): an entity type contributes configuration, and a reaction reads it |
| [09-audit-stamp.eson](09-audit-stamp.eson) | A **middleware** around the database write: it changes the input it passes on with `next` |
| [10-scoped-context.eson](10-scoped-context.eson) | Scoped context (F8, P13): the kinds that manage `transaction` and `user`, their wrappers (`inTransaction`, `authenticated`, `asSystem`), and authentication as request middleware |
| [11-message-consumer.eson](11-message-consumer.eson) | A message consumer that manages its own context key (`message`), and a consumer whose writes carry the original correlation |
| [dispatch-sketch.js](dispatch-sketch.js) | The native code: `invoke`, `slot-values`, `withContext`, `middleware` and `next`, node wrappers, kind resolution, and the lifecycle driver |

## The model

| Part of a kind | Meaning |
|---|---|
| `extends` | The parent kind. Chains can be any depth (instances are leaves: Q12). |
| `shape` | The schema of its instances' data (P9), added to AJV as `<kindId>`, so `@<kindId>` works in any schema |
| `defaults` | Data merged under each instance's data, along the chain from general to specific (P6) |
| `operations` | A primitive property of the kind (P8): what can be invoked on its instances. Collected along the chain; a subkind adds operations and never overrides them (Q7). |
| `slots` | Typed contribution points (Q16): `{ cardinality, value }`, where `value` is the schema of what fills contribute: plain data, or `@method` for behaviour |
| `context` | `{ manages, reads }` (P13): the context keys the kind's code may bind (and read), with their value schemas, and the keys it may only read and must work without. One tree of managers per key. |
| `lifecycle` | `load` (in-process registration; no I/O, no validation), `start` and `stop` (effects) |

| Construct | Meaning |
|---|---|
| `{ "invoke": <expr>, "operation": "op" }` | Invoke an operation **through an instance** (P8): the instance's kind chain provides it. Input and output are checked against `<owner kind>/<op>/input|output`. |
| `#.self` | The instance being invoked, with the chain's defaults merged in. Bound for the whole invocation, like `_ctx`: operations, branches, `forEach` bodies and middlewares all see it, until the next `invoke`. |
| `slot-fill` | `{ target, slot, value, position?, after?, before? }`. Contributes a value to a slot; the target is a kind (all its instances) or an element (one instance). The value is checked against the slot's value schema after load. |
| `slot-declaration` | `{ target, slot, cardinality, value }`: declares a slot on a kind from outside it (P11). Inherited like the kind's own slots. The kind's operations don't read it, so the declaring package provides the consumer. |
| `$func/slot-values` | `{ element, slot }` → the value (`one`, or `null`) or the ordered values (`many`). Pure: a read of the immutable registry. |
| `{ "middleware": <expr>, "action": <pipeline> }` | Runs a list of methods as middleware around `action`. The first method gets the node's input. |
| `{ "next": true }` | Inside a middleware: continue the chain with the node's input (its `inputMap`, or the middleware's `#.input`) and the current `_ctx`, and return what the rest of the chain returned |
| `{ "withContext": <mapping>, "do": <pipeline> }` | Binds values in `_ctx` for the block only (F8). The block sees the enclosing context, like an `if` branch. |

**There is no `service` kind (P10).** Every element with operations is an instance of a kind that defines them:

- **Singletons** are a kind plus one instance, and the instance holds the configuration. `password-hasher` (operation `hash`) has the instance `password` with `{ rounds: 12 }`. `schema-registry` (operation `add`) has the instance `ajv` with its AJV options. Other singletons referenced in the examples (`entity-database`, `entity-event-publisher`, `entity-relations`, `meilisearch`, `http-server`, `clock`) are assumed to follow the same pattern in their packages.
- **Entity types** are instances of `entity-type`, which defines `create`, `read`, `update` and `transition`.
- **Extra operations for one entity type** need a subkind: `user-account extends entity-type` adds `set-password`, and `user` is its instance.

The existing `{ "service": x, "method": m }` node maps to `{ "invoke": x, "operation": m }`. The examples use `invoke` throughout.

## Slots are data; the owner decides how values are used

A slot only collects values. What happens to them is the consumer's code, using ordinary nodes:

| Use | How | Example (02) |
|---|---|---|
| Read data | `{ "set": { "$func/slot-values": … } }` | `searchIndex` (08): configuration with a `mapping` method inside |
| Run one method | `{ "inputMap": …, "execute": "#.rule" }` | `businessKey`: the most specific rule, if any |
| Run methods in order | `{ "inputMap": { "$func/slot-values": … }, "forEach": { "inputMap": "#.change", "execute": "#.input" } }` | `guards` before the transaction; `reactions` inside it, after the write |
| Run methods as middleware | `{ "middleware": { "$func/slot-values": … }, "action": … }` | `interceptors` around the database write |

**Middleware is not a sequence.** Each middleware receives `next`, the rest of the chain followed by the action. It can act before and after it, change the input it passes on or the output it returns, skip it (short-circuit), or call it again (retry). `stamp-modified-by` (09) changes the input. `middleware` and `next` are native: a continuation in data would mean passing pipelines around as values, which is the quoting problem of A5. The chain itself is static data (slot values), not built at run time (F5).

## Order

**Between phases**, order is the owner's: where its operation uses each slot. In `create`: `businessKey`, then `guards`, then the transaction (`interceptors` around the write, then `reactions`).

**Within a `many` slot:**

1. Values are **independent by default** and come in a deterministic base order: general → specific target, then fill id. Never load order, and no numeric weights.
2. **Absolute position** is `position: "first"` or `"last"`. It puts the value in a band ahead of or behind every unpositioned value, without naming any other fill, so a fill states *its own* requirement ("authorization comes first") instead of a relation to fills it shouldn't know about. A band is not a single place: several `first` fills keep the base order among themselves.
3. **A real dependency** on a specific fill is stated with `after` or `before`, by whichever side knows about it. `X before Y` means `Y after X`.
4. Bands and relations go into one graph per slot (every `first` value precedes every unpositioned one, which precedes every `last` one), sorted topologically over the base order.
5. For middleware, the order runs from outside to inside: the first value wraps all the others. So `first` is outermost, `last` is innermost (closest to the action), and `after` means "inside": it runs after the other's code before `next`, and finishes before the other's code after `next`.
6. Load errors: an id that names no fill of the slot, a cycle (including `after`/`before` that contradicts the bands, such as a `first` fill `after` an unpositioned one), two fills of a `one` slot on the same target, or a `position` on a fill of a `one` slot. For `one`, the most specific target wins.

Use `position` for a requirement of the fill itself, and `after`/`before` only when the fill really depends on another one. Neither is needed when values are independent.

The two kinds of constraint in the examples:

| Fill | Constraint | Why that side states it |
|---|---|---|
| `contract-activation-events` (03) | `after: ["publish-entity-events"]` | It depends on the generic entity event (05) being published first, and it knows about it |
| `contract-update-authority` (07) | `position: "first"` | An unauthorized user must get "forbidden" before any business guard answers with a message that reveals the contract's state. That is a property of authorization, not a relation to one particular guard, so it names none. |

Resolved orders are not listed on any single fill once `before` and `position` exist, so `describe` or a dump shows the order of each slot as the loader computed it. For `construction`:

- `guards`: `contract-update-authority`, `contract-updates-only-in-draft`
- `interceptors`: `stamp-modified-by`
- `reactions`: `index-entity-documents`, `maintain-entity-relations`, `publish-entity-events` (all on `entity-type`, by id), then `contract-activation-events`

**Value contracts:** each slot's value schema is registered on load as `<owner>/slots/<slot>`, by `kind`'s load hook for the kind's own slots and by each `slot-declaration` for added ones. After load, every fill's value is checked against it. A method slot's value schema is `@method`; how the method is called is the consumer's contract.

## The fixed point: `kind`

`kind` is its own kind, so its `lifecycle` runs for every kind element, including `kind` itself. The native driver has no special case for kinds.

**`kind.lifecycle.load`:**

1. **`$func/check-kind`**: the structural checks a schema can't express. `extends` must name a kind; there must be no cycle along `extends`; no operation or slot may be redefined along the chain (Q7).
2. **Add its shape to AJV** under the kind id.
3. **Add its operation contracts** (`call add-contracts`) as `<kindId>/<operation>/input|output`, and each slot's value schema as `<kindId>/slots/<slot>`.

**Why there's no infinite regress.** To run `kind`'s hook on the `kind` element, the driver *resolves* `kind`'s kind. That is a data read: `getElement('kind').data.lifecycle`. It doesn't run anything. The circle closes after load, when the native shape check validates `kind.data` against the `kind` schema that `kind`'s own hook added.

**What stays native:**

| Native | Why it can't be an element |
|---|---|
| Loader, registry, `/data` `/ref` `/merge` | P1, P6: they make elements exist |
| Kind resolution (kind chain via `extends`; operations, slots and defaults along it) | It reads the data that defines behaviour |
| `invoke`: look up the operation on the instance's kind chain, check contracts, run it with `#.self` | The one dispatch rule |
| `middleware`, `next` and running an `execution-node-wrapper` | A continuation can't be expressed in data without quoting pipelines (A5) |
| `withContext` | It creates the scope; everything that uses a scope (`inTransaction`, authentication) is in data |
| `slot-values` | A pure function that reads the registry: the applicable values, in order |
| Lifecycle driver (`load` → shape and fill checks → `start` → `stop`) | It runs the hooks |
| Pipeline executor (`low`, `call`, `execute`, `forEach`, …) | It runs every pipeline (P3, P4). Keywords defined in data are found through the lazy view below. |
| **Lazy views** over the registry: `$func/<id>`, node keywords, injections, slot fills and declarations | Each one is looked up on first use, not registered |
| One AJV instance (the low implementation of `schema-registry.add`, and `schema-validate`) | External library with its own registry (P7) |

**Rules this requires:**

- **Load hooks are order-independent.** They only read element data (all loaded before the phase starts), add to AJV (order-free), and use lazy views. Today `$func` and keywords are registered eagerly, one element at a time, so a load hook using `$func` (as `entity-type`'s does) would depend on load order.
- **No validation during load.** Contract checks on calls made inside load hooks (`invoke ajv.add`) are skipped, and so is the `validateSchema` node. Load hooks read only element data, and that data is checked right after load.
- **Every element has a defined kind.** No `kind` means kind `data`, the trivial kind. An undefined kind is a load error, not silence (A1). The examples use a few kinds assumed to be defined by their packages: `message-channel`, `app-config/*`, the `entity-record` schema, and the singletons listed above.

## Schemas and AJV

Schema data is a compact schema; AJV validates and resolves `$ref`s (P7). `schema`'s operations (`validate`, `toJsonSchema`) are on the kind, like any other kind's.

| When | What happens |
|---|---|
| `load` | `ajv.addSchema(compactToStandard(data), id)`. No compilation; order doesn't matter (forward references work). |
| First validation | `ajv.getSchema(id)` compiles **exactly once**, lazily, and caches. An unresolved `$ref` fails here. |
| Later validations | `ajv.getSchema(id)(value)`: the cached function |

- **Every schema position gets an id at `load`.** Kind shapes: `<kindId>`. Operation contracts: `<kindId>/<operation>/input|output`. Slot values: `<owner>/slots/<slot>`. Schemas inside instance data: added by their kind's `load` hook (`entity-type` adds `<id>/dataSchema`).
- **The first validations happen in the native checks right after load,** so that's where kind shapes get compiled. Unresolved `$ref`s otherwise surface on first use; the workspace validator can request every id to catch them before deployment.
- **Never `ajv.compile` on a fresh object.** AJV caches `compile` by object identity only. Today `validateSchema` calls `ajv.compile(compactToStandard(schema))` on every validation (checked against AJV 8.18).
- **`@<kindId>` means the kind's shape.** This replaces the meta-schemas in `core.eson`, whose ids (`schema`, `service`, `pure-function`, …) collide with kind ids now that kinds are elements.

## Walkthrough: `POST /contracts/construction`

1. **Start.** The `http-endpoint` kind's `start` hook registered `create-construction`'s route.
2. **Request.** The native server invokes `create-construction.handle` with the request and an empty `_ctx`. `handle` binds `request` (`{ correlation, receivedAt }`), which `http-endpoint` manages. Its `requestMiddleware` runs `authenticate-requests` (10, `first`), whose value is `{ "authenticated": { "next": true } }`: the `authenticate` wrapper verifies the token and runs the rest of the chain inside `withContext: { user }`. The action maps the request to `{ data: body }` and invokes `construction.create`. `user` is carried from here down for this request, and visible only to code whose kind reads it.
3. **Resolve.** `construction.kind` is `insurance-contract`, so the kind chain is `[entity-type, insurance-contract]`. `create` comes from `entity-type`. `#.self.data` is `insurance-contract.defaults` (base schema fields and the states model) merged with `construction.data` (the `project` field).
4. **Check input** against `@entity-type/create/input`.
5. **Run `create`:**
   - Validate `data` against `@construction/dataSchema`. It was added on `load`; the first request compiled it.
   - `businessKey`: values exist for `insurance-contract` (uuid) and `construction` (sequence). The most specific wins, and running it gives `CON-2026-0001`.
   - `guards`, in order: `contract-update-authority` (`first`), then `contract-updates-only-in-draft`. Both pass, because the operation is `create`.
   - `inTransaction` (10): no transaction is bound, so it begins one and calls `next` inside `withContext: { transaction }`. The block runs in `create`'s context (`#.self`, `#.change`), and every invoke inside it passes `_ctx` down, so `entity-database`, `entity-relations` and the outbox write in the same session. Commit on success, rollback on a throw; either way the binding ends with the block.
     - The write, through the `interceptors` middleware: `stamp-modified-by` adds `modifiedBy` and calls `next`, which runs `entity-database.create`.
     - `reactions`, in order: `index-entity-documents` (08) indexes the record using `construction`'s `searchIndex` value; `maintain-entity-relations` (06) writes the policyholder relation; `publish-entity-events` (05) publishes the entity event; `contract-activation-events` (03, `after` the entity event) ignores `create`.
6. **Check output** against `@entity-type/create/output` (`@entity-record`).

## What disappears compared with today

- The `root-entity-class` / class / specific middleware tiers and their kind-string conventions. Targets are now the kind chain plus the instance.
- Ordering numbers (50, 75, 100). Where a slot is used defines when it runs; `after`/`before` order values within it.
- Middleware chains built at run time as quoted pipeline data (A5). The `middleware` node takes static slot values and a static action.
- The `entityType` parameter plus `getElement` dispatch in `entity-service`.
- `_ctx.entity`, which carried the extension's entity implicitly (A7). Operations read and pass the record explicitly.
- Writes to `_ctx` (`outputKey: "_ctx"`), the reset of `_ctx.transaction` to `false` in `finally`, and the `program`/`programInput` quoting in `executeInTransaction` (A5).
- Entity service extensions as a separate mechanism: a subkind adds operations.
- The `entity-rule/*` and `entity-search-index/{type}` naming conventions: they are slot values now.
- Special cases in `bootstrap.js`: `on-startup`, `ensureAdminUser`, endpoint activation.
- The registry's hard-coded `switch`.
- The demo's dead handler (A1). Fills are validated against declared slots and channels.

## Choices made here for open questions

| Question | Choice in this example |
|---|---|
| Q6: contracts that depend on the instance | Not solved. The contract says `data: object`, and the operation validates against `@<id>/dataSchema`. |
| Q7: inheritance | Subkinds **add** operations and slots, and never override. For `one` slots, the most specific value wins; for `many`, all values apply, from general to specific. |
| Q8: start order | Not solved: load order is used. |
| Q9: dynamic invocation | `invoke` takes an expression. Static ids (`"user"`) can be checked at load time; `"#.self.id"` is the common dynamic case. |
| Q10: adding slots to a kind you don't own | **Allowed** (P11): `relations` (06) and `searchIndex` (08) on `entity-type`. |
| Q11: `defaults` | Kept, as P6 merge. The schema caveats still apply (`!field` vs `field`, allOf). |
| Q15: order | Independent by default in fill-id order, `position: first|last` for a fill's own requirement, `after`/`before` for real dependencies on a named fill, outside-to-inside for middleware. No opt-out mechanism. Per-call contracts of method slots are now the consumer's (Q15c, revised by Q16). |
| Q16: slots as data | **Applied.** Fills contribute values; `slot-values` reads them; `forEach`, `execute` and `middleware` use them. |
| F8: context | **Applied.** Read-only `_ctx`, `withContext` for scoped bindings, `next` carrying the current `_ctx`, `inTransaction` as an `execution-node-wrapper`; kinds declare the context they manage and read (P13). |

## Scoped context (F8, P13)

`_ctx` is **read-only and flows down only**. It holds what code below a point needs but shouldn't take as input: the request's correlation and time, the authenticated user, the open transaction. This is the *dynamically scoped value* pattern (Java `ScopedValue`, Go `context.Context`, React Context). Those languages protect a key by module privacy; here every element is visible to every package, so a kind **declares** its rights (P13):

```json
"context": { "manages": { "transaction": "@transaction-session" } }
"context": { "reads": ["user"] }
```

- **Manages:** keys and their value schemas. The kind's code may bind these keys, and reads them. Each binding is checked against the schema.
- **Reads:** keys only; the value schema is the manager's, so a reader can't disagree with it. Reading a key no kind manages is a load error (a typo such as `usr`). The kind's code must work without them. Managed schemas have no required keys: `no user` means no roles (07), or `system` (09); no `transaction` means autocommit.
- **One tree per key:** all kinds managing a key must extend the most general of them. `authenticate` and `as-system` both manage `user` because both are `user-scope`; a second, unrelated manager is a load error.
- **Visibility:** code sees in `#._ctx` (and its `low` calls receive) only the keys its kind manages or reads. Other keys are carried on underneath, unseen, to the code it invokes.
- **Rights belong to the author:** the element a pipeline is written in, not the instance it runs for. An operation has its kind's rights; a fill's value has the fill's kind's rights, even while it runs inside `entity-type.create`; a wrapped pipeline keeps its caller's.
- **Bind:** `{ "withContext": { "<key>": <expr> }, "do": <block> }`. The block sees the enclosing context, like an `if` branch. When it returns, the outer `_ctx` is in effect again: nothing was changed, so there is nothing to reset.
- **Bind for what you wrap:** a wrapper or middleware calls `next` inside `withContext`; `next` carries the `_ctx` current at that point.
- **Bind on behalf of others:** code that needs a key bound but doesn't manage it uses a wrapper of the managing kind: request middleware uses `authenticated`, the admin bootstrap uses `asSystem` (04), `entity-type` uses `inTransaction`.
- **Write:** never. `outputKey: "_ctx"` is a load error.
- **Root:** empty. The native server, the broker and the lifecycle driver pass `{}`.
- **Across messages:** the publisher decides which part of the context it propagates in the message. The consumer kind manages its own key (`message`, 11) and binds it from the envelope; it can't bind `request` or `user`. The user who caused an event is not carried over: a consumer that must act as someone uses a `user-scope` wrapper.
- **Configuration is not context:** it doesn't vary per execution, so it's read with `$func/app-config` (04). The business key in 03 takes the year from the `clock` singleton rather than from the request time, so it reads no context.

**`inTransaction` is defined in data**, as an instance of `transaction-scope`, a subkind of `execution-node-wrapper`: its keyword's value is a pipeline written at the call site, its implementation is a middleware around that pipeline, and `next` runs it in the caller's context. So the wrapped pipeline keeps `#.self`, `#.change` and earlier outputs, which today's `executeInTransaction({ program, programInput })` loses, and it is never passed around as a value (A5). Inside an enclosing transaction it joins it.

| Key | Managed by | Read by |
|---|---|---|
| `request` | `http-endpoint` (01), in `handle` | `entity-event-publisher` (adds the correlation to envelopes) |
| `message` | `message-consumer` (11), in `handle` | `entity-event-publisher` (keeps the correlation across consumers) |
| `user` | `user-scope` (10): `authenticate`, `as-system` | `authorization-guard` (07), `audit-interceptor` (09) |
| `transaction` | `transaction-scope` (10): `in-transaction` | `entity-database`, `entity-relations`, the outbox (native, through `low`) |

Fills that read context are instances of a subkind of `slot-fill` (`authorization-guard`, `audit-interceptor`), because rights are declared on kinds. Fills that read none stay plain `slot-fill`s; `publish-entity-events` (05) no longer passes the correlation, because the publisher reads it.

**Still open:**
- Handles are not restricted: `transaction` is a session id that native code resolves to a client, and any declared reader may read it.
- Enforcement is sketched at run time (`withContext` checks, visibility projection). Rejecting undeclared reads and binds at load needs the static pipeline check.
