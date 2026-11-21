# Feature request for `lambdajson-js`: modules

Version targeted: a minor release after 3.8.0. The request is additive: no existing program changes its meaning.

This document is written for the maintainer of `lambdajson-js`. It describes the language and the compiler API only; it assumes nothing about the application that embeds the compiler.

## 1. Why

A LambdaJSON program can name values (`$let`) and local functions (`$fn`), and a host can add primitives (`compile(tree, primitives)`, `infer(tree, { primitives })`). There is no way to **share a set of functions written in LambdaJSON** between programs, with these properties:

- **Grouped and named.** The set is one named unit.
- **Private and exported members.** Some functions only serve the others and must not be visible outside.
- **Scoped import.** A program brings in the members of chosen sets without name clashes. Two sets may each have a member with the same name.
- **Statically typed.** `infer` types a call of a member, and can check a member against a declared signature.

Hosts emulate this today by building a table of primitives per function, with the scoping rules written again in each host. The names and the scope of functions are the language's business, so the request is to put the mechanism in the language.

## 2. Overview

Four pieces, in order of dependence:

| # | Piece | Where |
|---|---|---|
| 1 | **Injected modules**: named objects of functions, given to `compile` and `infer` | host API |
| 2 | **Qualified call**: `{ "$mod/name": argument }` reaches a member of any injected module | language |
| 3 | **`$include`**: `{ "$include": ["mod", …], "$in": body }` brings the members of modules into scope, unscoped | language |
| 4 | **Module definition**: `compileModule(source, options)` turns a source written in LambdaJSON into a module (private members, exports, signatures); `typeModule` types it | host API |

A *module* is a plain object whose keys are member names (each starts with `$`, no `/`) and whose values are primitives in the form the compiler already accepts for the host table: `argument => input => result`, for `infer` the typed form of `typed(fn, { takes, returns })`.

Everything the language needs to know about a module is that object. It does not know where a module came from.

## 3. Injected modules and qualified calls

```js
import { compile, infer } from 'lambdajson-js';

const pricing = { $net: argument => input => argument(input) / 1.2 };   // a primitive, as today

const program = { '$pricing/net': '#.gross' };
compile(program, {}, { modules: { pricing } })({ gross: 120 });          // 100
infer(program, { input: …, modules: { pricing: typedPricing } });        // number
```

- `compile(tree, primitives, { modules })`: the third argument is new and optional. `infer` already takes an options object, so `modules` is a new key there.
- A module name is a lowercase word, or words joined by `-`, or digits (`pricing`, `versions-helper-set`). Anything else is `invalid-module-name`.
- `{ "$mod/name": … }` calls the member `$name` of module `mod`. The call key is `$` + module name + `/` + the member name without its `$`. Call keys with a `/` already exist (`$func/<id>`), and this takes the same path.
- A qualified call needs no declaration. If the module isn't injected, compiling fails with `unknown-module` at the position of the call.
- A name found in the host's primitives table has priority over a module of the same qualified name. Hosts should avoid the overlap; it is not an error.

## 4. `$include`

```jsonc
{ "$include": ["pricing", "dates"],
  "$in": { "$sum": [{ "$net": "#.gross" }, { "$days": 3 }] } }
```

- `$include` is a scope form like `$let`, not a call. It takes a literal array of module names (not an expression) and `$in` is its body. It may sit beside `$let` in the same object, `$include` first.
- Inside `$in`, including lambda bodies and `$fn`, every member of an included module is callable unscoped (`$net`), and qualified still works.
- The scope is lexical and ends with `$in`. An inner `$include` extends the outer one; an inner member with the same name as an outer one shadows it, as `$let` does.
- `$capture` and `$template` return a mapping as data, and `$literal` keeps its tree: none of them carries the included names into the program that runs later. The program that runs later needs its own `$include`.
- **Ambiguity.** If two modules of one `$include` list have a member of the same name, the unscoped name is ambiguous. `$include` itself succeeds. A call of the unscoped name is the error `ambiguous-function` (path of the call, the modules in `data`); the qualified calls of both work.
- **Reserved names.** A member named like a primitive of the language (`$map`, `$if`, …) is the error `reserved-function`, reported when the module is injected (at `compile`/`infer`) or defined (`compileModule`). The language's own names are never shadowed.
- A name in the list that is not an injected module is `unknown-module`, at the path of `$include`.
- No run-time cost beyond the call: names are resolved when the program is compiled.

## 5. Defining a module

```js
import { compileModule, typeModule } from 'lambdajson-js';

const source = {
    functions: {
        $vat:   { $multiply: ['#', 0.2] },
        $gross: { $sum: ['#.net', { $vat: '#.net' }] },
        $net:   { $divide: ['#', 1.2] }
    },
    exports: ['$gross', '$net'],
    signatures: { $gross: { takes: { type: 'object', properties: { net: { type: 'number' } }, required: ['net'] }, returns: { type: 'number' } } }
};

const pricing = compileModule(source, { primitives, modules });   // { $gross, $net }
```

**Source.**

| Key | Meaning |
|---|---|
| `functions` | Required. An object `"$name": mapping`. A name starts with `$` and has no `/`. A call `{ "$name": argument }` evaluates the mapping with the value of `argument` as `#`. |
| `exports` | Optional list of names. Without it every function is exported. A function that is not listed is private. A name that is not a function is `unknown-export`. |
| `signatures` | Optional object `"$name": { takes, returns }`, JSON Schema types, as for `typed`. A key that is not a function is `unknown-signature`. |

**Scope inside a module.** A function sees: the language's primitives, the host's `primitives`, the host's injected `modules` (qualified), and the functions of its own module unscoped, private ones included. It does not see the names of the program that calls it. A function body may itself use `$include` of injected modules, so a module may use another module without any further feature.

**Result.** `compileModule` returns a module object (section 2) with the exports only. Each exported primitive is an ordinary primitive: a host may wrap it, for instance to check its argument and result against a schema. The language does not check signatures at run time.

**Resolution.** Calls between functions of one module are resolved lazily, on first use, so declaration order doesn't matter and a function that calls itself or a sibling that calls it back does not loop the compiler. Whether such a program terminates is the program's concern, as with any recursion the language already allows.

**Typing.** `typeModule(source, { primitives, modules })` returns `{ module, problems }`:

- `module`: the exports as typed primitives, to be injected into `infer` as a module. A function with a signature has `takes` and `returns` from it. A function without one takes anything and returns the type that `infer` gives its mapping, inferred with `#` of unknown type, in the module's own scope.
- `problems`: for a function with a signature, its mapping is inferred with `#` of the type `takes` and the result type is checked against `returns` (`type-mismatch` and the others `infer` has). Problems carry a path that starts with `functions.$name`.
- Inference is on demand with a guard for cycles (a function reached again while it is being inferred is typed `any`), so it does not depend on the order of declaration.

## 6. Errors

All at compile time unless noted, `LambdaJSONError` with `code` and a JSON Pointer `path`, and the same codes as problems from `infer`:

| Code | When |
|---|---|
| `unknown-module` | a qualified call or an `$include` names a module that was not injected |
| `invalid-module-name` | a module name that is not lowercase words joined by `-` |
| `ambiguous-function` | an unscoped call of a name that two modules of one `$include` both have |
| `reserved-function` | a member named like a primitive of the language |
| `unknown-export` | an `exports` entry that is not a function of the source |
| `unknown-signature` | a `signatures` key that is not a function of the source |
| `invalid-module` | a source without `functions`, or a function name that does not start with `$` or contains `/` |

## 7. Tests

- A qualified call of an injected module, and `unknown-module` for a module that isn't injected.
- `$include` of one and of two modules; lexical end of the scope; shadowing by an inner `$include`; `$include` beside `$let`; use inside a lambda body and inside `$fn`; the names are not carried by `$capture` or `$template`.
- `ambiguous-function` on a call of the unscoped name, with both qualified calls working; no error when the ambiguous name is not called.
- `reserved-function`.
- `compileModule`: private function not reachable from outside, reachable from a sibling; `exports` absent exports all; `unknown-export`, `unknown-signature`; a function that calls a sibling declared after it; mutual recursion does not loop the compiler; a function body that uses `$include`; the caller's included names are invisible inside the module.
- `typeModule`: the type of a call of an unsigned function is the inferred result type; a signed function reports `type-mismatch` for a body whose result disagrees with `returns` and `unknown-path` for a path that `takes` doesn't have; order of declaration does not matter; `infer` of a program with a call of a member of the typed module has the member's result type, and checks the argument against `takes`.
- Existing programs and primitives tables are unaffected.

## 8. Documentation

README: a section for modules with the examples of 3 to 5, and a "Changes in 3.9.0" note in the style of the existing ones.

## 9. Not requested

Where a module's source is stored, what a module's name means to the host, loading and versioning, aliases for module names, re-exporting, checking a signature at run time, the type of `#` for functions without a signature, and any notion of an application, an element or a package.

## 10. Why not smaller

- **Host primitives only** (what exists): the scoping rules (private members, a member that sees its siblings and not the caller, exports) would be written again by every host. They are rules about names, which the language already owns.
- **Only injected modules and `$include`** (no `compileModule`): a host would still build modules by hand with the same scoping rules, and `infer` would have no way to check a function against a signature.
- **Only `compileModule`** (no `$include`): every call would be qualified, which is too long for a program that calls five members a hundred times.
