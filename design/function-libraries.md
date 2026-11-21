# Function libraries: shared functions for the code of elements

Status: **built** (uncommitted) on `lambdajson-js` 3.9.0, which provides what [lambdajson-modules-request.md](lambdajson-modules-request.md) asked for. Section 2 records the interim form that was built first and removed; sections 3 to 5 are the design; section 6 is what was decided and what is open.

## 1. The problem

The code of an element is LambdaJSON: mappings with no names of their own. Two needs came up while the tests were moved to elements ([scenarios](../implementation/test-framework/scenarios/README.md)):

- **Reuse inside the code of one element or of several.** A test builds the same contract, amendment and timeline in every case. Written out, the fixtures were 9,871 characters (without whitespace and quotes) against 6,408 for the JS test they replaced.
- **Reuse that is visible to `validate()`.** A helper written as a `$let` wrapper ran, but `bpf validate` reported its names as unbound, and a misspelled call was found only at run time.

The only shared unit before was the `pure-function` element: **global** (`$func/<id>`), **one function per element**, with a required `signature`. It cannot group functions, keep some of them private, or leave the contract out.

## 2. The interim form (removed)

A first version made a library part of the element model: a field typed `@ref/function-library` in a kind's shape, found by the framework, a table of functions per element and per author, carried through `validate()`. It worked where a caller passed the table, which was the `mapping-test` runner alone: a call in a pipeline validated and then failed with an unknown function, because the executor and every package that evaluates a mapping would each have had to carry the table of the author of the code. A kind's own code and a child kind's needed more fields and a mapping on top. The scope rules (private members, siblings, exports, ambiguity) were written in the framework although they are rules about names. Section 3 is what replaced it.

## 3. Principle

The concept is a **module**: a named set of functions with private and exported members, and an import of its exports. It is a concept of the language. An element is only one way to store the source of a module and to name it. The language knows nothing of elements, and the framework adds nothing to how names are scoped.

## 4. Design

### 4.1 In the language

The request to `lambdajson-js` ([lambdajson-modules-request.md](lambdajson-modules-request.md)) has the full specification. In short:

- The host **injects modules**, named objects of functions, into `compile` and `infer`.
- A **qualified call** `{ "$pricing/net": "#.gross" }` reaches the member of any injected module, as `$func/<id>` reaches a pure function.
- **`$include`** brings the members of modules into scope for a body: `{ "$include": ["pricing"], "$in": { "$net": "#.gross" } }`. The scope is lexical, like `$let`. The same unscoped name in two modules of one list is ambiguous and fails when called; the qualified names work.
- **`compileModule(source)`** compiles a module written in LambdaJSON (`functions`, `exports`, `signatures`); a function sees its siblings, private ones included, and never the caller's names. `typeModule(source)` types it.

### 4.2 In the framework

`function-library` is the element that holds the source of a module. Its data stays as it is now:

```jsonc
{
    "id": "versions",
    "kind": "function-library",
    "data": {
        "functions": {
            "$contract": { "$merge": [{ "premium": "#[1]", "currency": "EUR" }, { "$if": [{ "$isNil": "#[0]" }, {}, { "startDate": "#[0]" }] }] },
            "$first":    { "$func/start-body-versions": { "body": { "$contract": ["2025-01-01", 100] } } },
            "$timeline": { "$amend": [{ "$first": null }, "2026-03-01", [], "a-1"] },
            "$amend":    { … }
        },
        "signatures": { "$amend": { "input": { "timeline": "array" }, "output": "object" } },
        "exports": ["$contract", "$timeline"]
    }
}
```

The id is the module name. The framework's part is short:

1. **Compile.** At boot each loaded `function-library` is compiled to a module with `compileModule`, lazily on first use. The `input` and `output` of a signature (compact schemas, as for a pure function) become the `takes` and `returns` the language wants.
2. **Inject.** Every compilation of a mapping ([mappings.js](../implementation/core/src/mappings.js)) and every `infer` ([data-flow.js](../implementation/core/src/analysis/data-flow.js)) gets the loaded modules. Any code of any element can then call `$versions/contract` or use `$include`, with no field, no shape and no executor change.
3. **Check the contract.** The framework wraps each exported function of a module that has a signature, outside production, and checks its argument and result as for a pure function (`function-contract`). The check is at the boundary: a call from one function of the module to its private sibling isn't checked.
4. **Report.** Errors of the language (`unknown-module`, `ambiguous-function`, `reserved-function`, …) become `CoreError`s as the other errors of the language do, and `validate()` reports them with their path.
5. **Tools.** `bpf refs <library>` lists the elements whose code calls it. The walk that finds `$func/<id>` calls also finds qualified calls and the lists of `$include` ([code.js](../implementation/core/src/analysis/code.js)).

A library that uses another library needs nothing more: its function bodies call the other module qualified, or start with `$include`.

### 4.3 Use

```jsonc
{ "id": "premium-mapping-test", "kind": "mapping-test",
  "data": { "subject": { "$include": ["versions"], "$in": { "$contract": ["2026-03-01", 120] } } } }
```

or without `$include`, `{ "$versions/contract": ["2026-03-01", 120] }`.

### 4.4 What the interim form left behind

Nothing of it remains: no field in the shape, no table per element, no `helpersOf`, no `primitives` on a kind, no `libraries[]` of `mapping-test`. The `function-library` kind keeps `functions`, `signatures` and `exports`, and the language reports what is wrong with them (`unknown-export`, `unknown-signature`, `reserved-function`), so the kind needs no `validate` hook.

## 5. Decisions

| Question | Decision | Why not the alternatives |
|---|---|---|
| Where the concept lives | the language (module, `$include`, qualified call, `compileModule`) | A host mechanism repeats the scope rules in every host and needs the table of the code's author at every place that evaluates code (section 2, problem 1). |
| What the framework adds | the element that stores a module's source, the injection, the contract check, `refs` | Nothing about names or scope. |
| Inclusion | in the code, `$include` or a qualified call | A reference in the shape ties inclusion to the element and to a kind, and the executor then has to carry it. |
| Direct call without inclusion | the qualified call, for any loaded module | The dependency is visible in the code, as for `$func/<id>`. |
| Visibility | `exports` on the module source | A `_` prefix hides the contract in a naming rule; a per-function flag can't be a field of a plain mapping. |
| Typed or ad hoc | `signatures` beside `functions`, the same keys | One map of `{ signature, mapping }` is ambiguous with a mapping that returns that object. |
| Run-time contract | the framework, at the boundary | The language knows no schemas of the host, and a private call is trusted. |
| Aliases, re-exports | not now | No case needs them. |

## 6. Decided and open

Decided while building:

1. **`mapping-test` does not get an `include[]`.** A wrapper applied by the runner is invisible to `validate()`, which infers the authored mappings (the same trap as the `$let` wrapper of the first attempt). A test calls the qualified name (`$versions/contract`; the library's id is `versions`) or writes `$include` itself, and lists the library in `given` so that it is loaded.
2. **`given` stays explicit** for a library used in code. The walk that finds the references from code exists (`bpf refs`), but nothing loads from it.
3. **`$func/<id>`** that doesn't exist is now `unknown-module`: the language reads `func` as a module name. The code of the diagnostic changed, its place did not.
4. **The contract check is at the boundary**, on the exports of a library that have a signature. A call between two functions of one library is not checked.
5. **Libraries may use each other** in any order of declaration; they are compiled in dependency order, and a cycle leaves them uncompiled with the language's error reported.

Open:

1. **A cycle between libraries** is reported as the error of one of them (`unknown-module`), not as a cycle.
2. **Run-time cost of the contract check** outside production, per call: cached validators, but not free in a hot `$map`. Left until a profile shows it.
3. **Signature form.** An author writes compact schemas (`input`, `output`); the language gets JSON Schema types through `compactType`. Two forms for the same thing, as for pure functions.

## 7. Work

Done: modules in the language (3.9.0); compile and inject (`mappings.js`, `libraries.js`, `data-flow.js`); the contract wrapper; `bpf refs` through `callReferences`; `mapping-test` and the tests of `entity/entities` on qualified calls; the interim form removed. Tests: [function-libraries.test.js](../implementation/core/test/function-libraries.test.js), including a library called from a pipeline run by the executor.
