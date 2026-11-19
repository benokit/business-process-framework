# Typed code positions: what was decided

Status: **built** (F83 resolved, R3.8 done). Kept as the record of the decision and of the designs that were tried and dropped.

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

## 5. Not covered

- The code of a step extension (a fill of `stepExtensions`) runs in the scope of its target definition and is not typed.
- The scope is described twice: built at run time by `process-scope`, typed by `scopeOf`. They can drift; the long-term answer above removes the second.
