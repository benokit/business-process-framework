# `body` as a trait, and trait configuration as kind data

Status: **implemented** (R6.6 to R6.10): the first form (§5) replaced `bodySchema`, R6.10 replaced its precedence rules with the model in §2 to §4. It completes P17 ([postulates.md](postulates.md)) and F22 ([critique.md](critique.md)). The traits are in [entities](../implementation/framework/entities/README.md), keyed traits in [versionable](versionable.md), `fixed` in [kind-settings](kind-settings.md) §2, the composition algebra in [data-composition](data-composition.md).

## 1. Problem

`body` was called "a trait like any other" and wasn't one: `bodySchema` was a property of the shape of `entity-type`, `create` and `update` were hard-wired to it, the change operation `update` existed for it alone, `entity-record.data` required it, its key was reserved. Once `versionable` showed what a trait can be, the asymmetry was visible.

The reason it was built so is that `bodySchema` is **instance data**, written in the entity type's own element and composed along the class chain. A `traits` slot fill, the only place a trait was configured, is the wrong place: it lives apart from the element, and per key the most specific fill replaced the whole configuration. Making `body` a trait needs the missing half: configuring a trait through the data of the kind that uses it.

## 2. Model

A trait use is `{ trait?, configuration }` under a key of the `traits` map. `trait` may be omitted when the key is the id of a trait of cardinality `one` (`body`, `state`); a `many` trait is always named. The configuration is checked against the schema the trait declares (`<trait>/configuration`), so it follows implicitly from the trait type; nothing in a kind restates it.

`entity-type` fixes the one generic shape, and declares `body`:

```json
{ "id": "entity-type", "kind": "kind",
  "data": { "shape": { "traits{}": "@entity-trait-use" },
            "fixed": { "traits": { "body": {} } } } }
```

### Contributions

The effective use of a key is the **deep union of every contribution**, as `fixed` unites values: the same path with a different value is a conflict (reported by `validate()`, naming the contributor and the path), equal values are accepted, nothing replaces anything. All contributions name the same trait.

| Source | Is | Written as |
|---|---|---|
| kind chain | the specification: which traits an entity type has, with defaults | `fixed.traits` of `entity-type`, a class, a subclass |
| entity type element | what the instance configures, and its own traits when it has no class | `data.traits` |
| injection | a trait someone else adds, and specialisations of it | slot fills of `traits`, `{ trait?, key?, configuration }`, `configuration` required |

```json
{ "id": "insurance-contract-type", "kind": "kind",
  "data": { "extends": "entity-type",
            "fixed": { "traits": {
              "state":    { "configuration": { "states": { "status": { "draft": true, "issued": true, "active": true, "cancelled": true } },
                                               "transitions": { "issue": { "status": { "draft": "issued" } }, … },
                                               "initialStates": { "default": { "status": "draft" } } } },
              "timeline": { "trait": "versionable", "configuration": { "schema": "@contract-terms" } } } } } }

{ "id": "marine", "kind": "insurance-contract-type",
  "data": { "traits": {
      "body":  { "configuration": { "schema": { "!policyholder": "string", "!vessel": "string", "!currency": "string" } } },
      "state": { "configuration": { "states": { "status": { "suspended": true } },
                                    "transitions": { "suspend": { "status": { "active": "suspended" } },
                                                     "cancel": { "status": { "suspended": "cancelled" } } } } } } } }
```

`marine` adds to the class's state model and removes the `/merge` and `/ref` of the first form. A class and an instance can each give a part of the `body` schema: the union of two object schemas is the combined schema, which replaces the named schema element and `$data#&` the contracts needed.

### Who may contribute

- **Injection.** A fill adds a trait for any entity type it targets, and a fill on a more specific kind or element may specialise it by adding paths to the configuration. This is how a package contributes to kinds it doesn't own (an audit trait on every entity type).
- **An injected trait is not the instance's business.** An instance author doesn't know it and a kind below the injector may not override it. A key that exists only because a fill introduced it is **closed to instance data**: `validate()` reports "traits.audit is injected by audit-everywhere and not declared by insurance-contract-type". If the trait matters to the business, the kind declares it in `fixed.traits`; the key is then part of its specification, its configuration is the union of the kind's and the fills', and instances may add to it.
- **A standalone entity type** (`party`, `user`: an instance of `entity-type` with no class) is itself the specification, so its `data.traits` may declare keys of its own. Only keys introduced by fills alone are closed.

### Validation

`validate()` reports: a configuration that doesn't match the trait's schema; a conflict between contributions; a key used by two traits; a `trait` omitted for a key that is not a `one` trait; a missing key on a `many` trait and a key on a `one` trait; a key that isn't lowercase letters and digits in segments joined by `-`; and a schema in which one field appears both optional and required (`holder` and `!holder`), because the union of two layers would otherwise keep both silently.

## 3. The `body` trait

`body` is an element in `entities`, no different from `versionable`:

```json
{ "id": "body", "kind": "body-trait", "data": { "cardinality": "one", "configuration": { "!schema": "@schema" } } }
```

| Concern | As a trait |
|---|---|
| Schema | the trait's `load` registers `<entityType>/body/schema` per use, as `segment-schemas` registers `…/segment` |
| `create` | `initialize` asserts `traits.body` against the schema and returns it |
| Write | `entity-bodies.put({ entityType, businessKey, revision, value })` checks the value and calls `writeTrait` with the key `body` and the command `put`; the `PUT` endpoint calls it |
| Required | declared by `fixed.traits.body` of `entity-type`; `entity-record.data` is any object |
| Events and changes | a body change is a `trait` change with `key: body`, `command: put`; there is no change operation or event type `update` |

`create` takes `traits` only; the HTTP `POST` maps `body` onto `traits.body`. Consumers (`users`, `oauth`, authorization) still read `data.body`.

## 4. Consequences

- **One composition model.** Configuration is kind data composed by union, like `provider` of an integration; traits have no precedence rules of their own.
- **One write path.** Guards, interceptors and reactions treat `body` like any trait.
- **Defaults are final.** A value in a class's `fixed` can be added to, not replaced. A default an instance may replace would be a setting ([kind-settings](kind-settings.md) §3), not a trait feature.
- **Arrays** at one path must be equal in all contributions; appending to an injected list is not possible.
- **Entities without business data** are possible by moving the `body` declaration from `entity-type` to a base class; not needed yet.

## 5. Steps

First form, **done** (R6.6 to R6.9): `traits` in the data of the element as a map from key to the bare configuration, completing slot fills whose `configuration` became optional, with precedence data over fill over class; `body-trait`, `entity-bodies`, `body` declared by a fill on `entity-type`; `update`, the change and event type `update`, and `bodySchema` removed; the gateway and endpoints mapped onto `entity-bodies.put`; callers, tests, demo and documentation migrated.

Revision, **R6.10, done**:

1. The `traits` property takes `{ trait?, configuration }`; `entity-type` fixes the shape and `fixed.traits.body`; the fill `entity-type-body` goes.
2. `traitsOf` unites the contributions of the kind chain's `fixed`, the fills and the data, reporting conflicts with their sources; `configuration` of a fill is required again; the first form's precedence is removed.
3. `validate()`: closed keys, `trait` optional only for a `one` trait, a field in both optional and required form.
4. The demo and tests migrated: class state models and timelines into `fixed.traits`, `marine` without `/merge`; `party` and `user` with the wrapper.
5. Documentation of the owners: [entities](../implementation/framework/entities/README.md#traits), F22, [refactoring-plan](refactoring-plan.md).

## 6. Open

- **Appending to arrays** in a specialising fill, which needs a rule in the algebra ([data-composition](data-composition.md)).
- **Slot sources in general.** Declaring guards, reactions and the business key rule in an element's own data, by the same argument of locality; values are methods, keyed only for traits. Decide after R6.10.
- **A trait that reads another's configuration** (versionable keeping `body` as the version valid now, the open point of F22): the contributions of a key are reachable by key; whether one trait may use them is a separate rule.
