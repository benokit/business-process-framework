# Typed code positions: a schema declares the input type of its mappings

Status: **in progress** (F83, R3.8). Step 1, the core, is built; steps 2 and 3 are open.

## 1. The problem

`validate()` infers every mapping and method of every element with `lambdajson-js` and reports what it finds. For that it needs the type of the **input** of each piece of code. The core knows it for four kinds of position only, a fixed list in `mappingInput` and `methodStart` ([data-flow.js](../implementation/core/src/analysis/data-flow.js)):

| Position | Input type |
|---|---|
| `mapping` of a kind | the id and the data of the kind |
| `lifecycle.validate`, `lifecycle.explain` of a kind | the `self` of the kind (and the element) |
| `mapping` of a pure function | `signature.input` |
| a slot fill | the `input` the slot declares |
| (kind operations and execution node templates, for methods) | the operation contract, the node shape |

Any other position is inferred against `any`. A package that owns a kind with code in its instances has no way to say what that code receives. `entity-processes` shows the cost: a process definition holds mappings in six places of its steps (`set`, `open.<task>.body|dueOn|assignTo`, `choose`, `wait.when[].test`, `wait.until.at`, `onError[].set`) and a method (`do`), all of which see the scope of the definition (its roles typed from their entity types, its variables, its input). To get them checked, [definitions.js](../implementation/entity/entity-processes/src/definitions.js) carries its own copy:

- `mappingsOf`, a second list of the mapping positions of `process-step`, which the schema `process-step` already declares with `@mapping` (drift: a seventh mapping field added to the schema is not type-checked until it is also added there);
- `scopeOf` with `participantType`, `recordType`, `traitType`, `processType`: the type of the scope;
- `typingProblems` and `unknownPathMessages`: running the inference and keeping the `unknown-path` problems.

That is about 55 of the 212 lines. `views.js` imports `scopeOf` too, to type the conditions it reads from.

## 2. What the core already does that this builds on

- The code positions of an element are found from its **schema**: `positionsIn` walks the shape and reports every value whose schema is `@mapping` or `@method` as `{ type, code, path }`, with a dotted path into the element's data ([schemas.js](../implementation/core/src/schemas.js), `typedAt`).
- A schema reference can already carry a parameter in its name: `@ref/<kind>` is a reference to an instance of that kind (`referenceAt`).
- Types are declared next to the thing they type elsewhere too: a slot declares the `input` of its fills, an operation its input contract, a pure function its `signature`.
- A pure-function element is a named, typed function (`$func/<id>`), callable from the core at validation time (`boot` has prepared them).

## 3. Design

### 3.1 The interface: an abstract kind that provider functions implement

The core declares the contract once, as a subkind of `pure-function` that fixes the signature:

```json
{ "id": "input-type-pure-function", "kind": "kind", "data": {
    "extends": "pure-function",
    "fixed": { "signature": { "input": { "!id": "string", "!kind": "string", "!data": "object" }, "output": "object" } }
} }
```

An instance is a pure function that gets the element that owns some code and returns the type of what that code receives, as a JSON Schema. The instance does not repeat the signature (a `fixed` value is filled in before the shape is checked, and an instance that contradicts it fails with `fixed-conflict`). Because it is still a `pure-function` (`instancesOf` includes subkinds), it is callable as `$func/<id>`, synchronously, which `validate()` needs; and `bpf list input-type-pure-function` lists every provider in an application.

The name follows the naming rule: what it specializes (`input-type`) and the base kind (`pure-function`).

### 3.2 The declaration: `@mapping/<provider>` and `@method/<provider>`

A schema position names the provider of its code's input type:

```json
{ "id": "process-condition", "kind": "schema", "data": { "!test": "@mapping/process-scope-type", "!then": "string", "resolve{}": "string", "*": "never" } }
{ "id": "process-step", "kind": "schema", "data": { "do": "@method/process-do-input-type", "set": "@mapping/process-scope-type", ... } }
{ "id": "process-error-exit", "kind": "schema", "data": { "!catches[]": "string", "set": "@mapping/process-error-scope-type", "!then": "string" } }
```

`@mapping` and `@method` without a name keep their meaning (nothing existing changes). The name is part of the position, like the kind in `@ref/<kind>`: `positionsIn` returns `{ type: 'mapping', input: 'process-scope-type', code, path }`. The named element must be an instance of `input-type-pure-function`, which the reference check verifies as it does for any `@ref/<kind>` (`unknown-element`, `invalid-reference`): a schema can only name a function that implements the interface, and a function with another contract is refused with a message that says so.

### 3.3 The providers of `entity-processes`

One JS function and two mappings, all instances of the interface:

- `process-scope-type`: `scopeOf` of `definitions.js`, exposed (`module`, `export`). Building a type from traits and schemas is infrastructure, so JS.
- `process-do-input-type`: a mapping, `{ "$omit": { "object": { "$func/process-scope-type": "#" }, "keys": ["output"] } }`.
- `process-error-scope-type`: a mapping, the scope plus `error: { code, message, data }`.

These replace the `extra` argument and the `doScope` of today.

### 3.4 In the core

1. `execution.eson`: the kind `input-type-pure-function`, and a `lifecycle.load` hook of `pure-function` that registers the schemas `mapping/<id>` and `method/<id>` (both `@mapping` and `@method` as they are) for every pure function, the way a kind registers `ref/<id>`. Registering them for every function, not only providers, lets the reference check say what is wrong (3.2) instead of the validator failing with an unresolved reference.
2. `schemas.js`: `typedAt` recognises `@mapping/<name>` and `@method/<name>`, and `positionsAt` carries `input` on the position. The value is validated exactly as a `@mapping` or `@method`.
3. `data-flow.js`: `mappingInput(author, path)` and `methodStart(author, path)` take the position. With an `input`, the type is `typeOf(<provider>(author))`; positions without one keep the hard-coded cases.
4. `code.js`: the reference check of the name (3.2).
5. The problems the inference finds are reported like those of every other position: the element id, the data path (`steps.hold.wait.when[0].test.$eq[0]`), the message.

### 3.5 What `entity-processes` drops

`mappingsOf`, `typingProblems`, `unknownPathMessages` and their imports (`methodType`, `mappingType`), about 40 lines. `scopeOf` and its helpers stay as the provider. `processDefinitionProblems` keeps the graph and reference checks, which are a different matter.

## 4. Alternatives considered

- **The function named directly, with no interface** (`@mapping/<function>` to any pure function). The schema then depends on whatever function that is, and a function with the wrong contract is found only when it runs. The interface kind fixes both.
- **The schema names a scope and the kind implements it** (`@mapping/step`, and a `scopes` property of the kind with a mapping per scope, inherited along the chain like a hook). It decouples the schema from any element, but it adds a property to the shape of `kind` and gives providers no identity of their own (they cannot be listed, referenced or reused by another kind). The interface kind uses concepts that already exist (`fixed`, subkinds, typed references).
- **A kind property that lists positions** (`codeInputs: { "steps.*.set": <function> }`). It needs a path-pattern language and keeps the second list of positions that the schema already has: the drift stays.
- **Typing from the kind's `lifecycle.validate` hook**, exposing `mappingType` as a `$func`. The positions would be listed in the hook's mapping: the same duplication in an element instead of in JS.
- **Leave it.** Cost: the drift above, and every package with code in its instances would copy the scheme.

## 5. Decisions needed

1. **`choose`.** `process-step.choose[]` is `@any` because an entry is a tuple `[test, step]` that the compact schema language cannot express (no tuple in it). The core therefore cannot find the test as a position, and the typing of `choose` tests would be lost. Two ways: (a) change the entries to objects `{ test, then }`, as `wait.when` entries already are; it is a migration of the `choose` uses (two tests, the entity-processes README, none in the demo) and makes the schema, and the `chooseProblems` check, declarative; (b) keep a small residual check in JS for `choose` only. I recommend (a).
2. **How much is reported.** Today only `unknown-path` problems are kept, because the scope types are partly open (`process`, `signal`, `output` are `any`). With the core's reporting every problem class appears (`type-mismatch`, `missing-property`, ...). This is the same strictness as every other element, but it can show false positives where the scope type is looser or tighter than the truth. I propose to take it and fix the types it exposes, checked against the whole suite and the demo before it is merged; if it is too noisy, a position can later carry a list of problem codes to keep.
3. **Extension fills.** The code of a step extension (a fill of `stepExtensions`) runs in the scope of its target definition, which is not the author. It stays `any` (as now); typing it needs the provider to be called with the fill's target, a follow-up.

## 6. Risks and what is not verified

- Verified in step 1: a kind registers a schema `ref/<id>` for itself in its `load` hook, and `mapping/<id>` is registered the same way. `fixed: { signature }` is filled in before the one-of shape of `pure-function` is checked (an instance without a signature loads), and an instance that contradicts it fails at load with `fixed-conflict`, not in `validate()`.
- The provider runs at validation time on every `validate()` and for every position of its kind: it must be cheap and cached per author (the data flow already memoises per element).
- Reporting more problem classes (decision 2) can break existing process definitions in the demo or in tests until the scope types are exact.

## 7. Steps

Each step leaves the system working with its tests passing.

1. **Core:** the kind `input-type-pure-function` and the position parameter (3.4), with tests: a kind with a `@mapping/<provider>` position reports an unknown path with the element id and path; a `@method/<provider>` position; a name that is no element, or not an instance of the interface, is reported; a provider that contradicts the fixed signature is `fixed-conflict`; `@mapping` and `@method` unchanged.
2. **`entity-processes`:** the three providers (3.3); the schemas use them; `choose` as objects (decision 1a); `definitions.js` loses the typing code; tests: the existing unknown-path tests now expect the core's messages (element id and path in place of `step 'x' where`), a new test that a mapping field added to the schema is type-checked without further code.
3. **Documentation:** the core README (positions, their input types and the interface kind), the entity-processes README (`choose`), and `critique.md` F83 removed.

## 8. Follow-ups, not part of this change

- Express the hard-coded positions of the core (`mapping` of a kind, `lifecycle.validate`, `lifecycle.explain`, a pure function's `mapping`) the same way, with providers in the schemas of `kind` and `pure-function`: `mappingInput` would then be a lookup and nothing in it would be special.
- Typing for step extensions (decision 3).
