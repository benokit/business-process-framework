# Data composition algebra

Status: **implemented** (R10.1, `core/src/composition.js`). It replaced the deep merge of `/merge`. The postulate is P21 in [postulates.md](postulates.md); the work is R10 in [refactoring-plan.md](refactoring-plan.md). Today's behaviour is described in [core/README.md](../implementation/core/README.md#data-composition). Kind values and settings, which used to share this algebra through `defaults`, are in [kind-settings.md](kind-settings.md).

## 1. Scope

The algebra composes data in `/data` of an element, once, at boot, before kinds are resolved. It is **type agnostic**: it knows nothing of shapes or schemas, so it needs no kinds and works for kinds themselves.

It is not used in inheritance. Inheritance composes the shape (all-of, §4), operations, slots and context by their own rules, and the values a kind supplies by `fixed` and `settings` ([kind-settings.md](kind-settings.md)). Because no composed value carries markers into a later phase, one syntax has one phase.

## 2. Principles

1. **Type agnostic.** Objects recurse, everything else is replaced.
2. **Associative.** Composing `a ∘ b ∘ c` doesn't depend on grouping. `unset` is a value (a tombstone), not an action, to keep this.
3. **Schemas compose with their own primitives.** The algebra never combines schemas. An author who wants the meet of two schemas writes it: `{ "$data#&": [{ "/ref": "a" }, { "/ref": "b" }] }`.
4. **No string syntax, no functions.** Operations are value wrappers (trees). There is no operation that applies a function to the inherited value: it would break static analysis and associativity. Computed edits belong in a `load` hook (Q4).

## 3. Operations

A composition is a left-to-right fold: `base ∘ over`. Absent is the identity.

| Operation | Written | Effect |
|---|---|---|
| `merge` (the default) | an unmarked value | Objects recurse key by key. Anything else on the right replaces the left, arrays included (no merging by index). |
| `replace` | `{ "/replace": v }` | The right value wins as a whole; the left is not recursed into. |
| `unset` | `{ "/unset": true }` | The key is removed. It is a tombstone: a later item can set the key again. |
| `append` | `{ "/append": [...] }` | The items go after the array on the left. |

`prepend` is not introduced until a case needs it. A merge key for arrays of objects (Kubernetes' strategic merge) is not introduced either: collections whose elements have an identity are maps keyed by that identity (`transitions{}`, `operations`, slot fills), and a map is edited unambiguously by this algebra, `merge` changing one entry and `unset` removing one. The framework prefers a map wherever order doesn't matter.

`replace` at the root reaches any tree from any base, so the set is complete over trees. The other operations keep information and can be checked statically.

### Composition table

A fold keeps markers unresolved until its end, so every pair of intermediate forms has a result. The forms are absent `ε`, a plain value `p`, `R(v)` (replace), `U` (unset) and `A(xs)` (append); `x` is the base composed so far and `y` the next item. They are the same wrappers authors write, so an intermediate result is expressible in the same syntax.

| x ∘ y | y = `p` object | y = `p` scalar or array | `R(w)` | `U` | `A(ys)` |
|---|---|---|---|---|---|
| x = `ε` | `p` | `p` | `R(w)` | `U` | `A(ys)` |
| x = `p` object | merge by key, each key by this table | `p` | `R(w)` | `U` | type error |
| x = `p` array or scalar | type error | `p` | `R(w)` | `U` | array: `p ++ ys`, otherwise type error |
| x = `R(v)` | `R(v ∘ p)` | `R(p)` | `R(w)` | `U` | `R(v ++ ys)` |
| x = `U` | `R(p)` | `R(p)` | `R(w)` | `U` | `R(ys)` |
| x = `A(xs)` | type error | `p` | `R(w)` | `U` | `A(xs ++ ys)` |

A value after a tombstone or a replace is sealed (`U ∘ p = R(p)`, `R(v) ∘ p = R(v ∘ p)`), so nothing further left merges into it. That is what makes the fold associative: with `unset` as a deleting action, `base ∘ (mid ∘ leaf)` and `(base ∘ mid) ∘ leaf` differ when `mid` unsets an object that `leaf` sets again (`{max: 3, delay: 5}`, unset, `{max: 1}` must give `{max: 1}`). Resolution happens once, at the end of the fold: `R(v)` gives `v`, `U` the key absent, `A(xs)` gives `xs`, `p` stays `p`.

## 4. Shape composition (for reference)

A kind's shape is validated by every kind of its chain, so the effective shape of a subkind is the all-of of the shapes along the chain. A conflict (clashing fixed values, an empty enum intersection, a type clash, a `never`) is reported by `validate()`, naming the kinds that contributed the clashing parts. This is existing behaviour; the algebra doesn't change it.

## 5. Laws

- **Associative:** `(a ∘ b) ∘ c = a ∘ (b ∘ c)`.
- **Identity:** absent.
- **Closed:** the result of a composition is expressible in the same syntax (§3 table).

The laws are tested as properties: random chains of the five forms, with both groupings compared.

## 6. Consequences for existing features

- `/data` keeps `/ref`, `/literal`, `/uri`; `/merge` takes the operations above in its items. Arrays in `/merge` stop merging by index (breaking change; the demo and the packages are migrated in the same step).
- `defaults` of a kind is removed; see [kind-settings.md](kind-settings.md).
- Binding rights of code in a composition result are unchanged ([core/README.md](../implementation/core/README.md#data-composition)).

## 7. Open points

- Whether `validate()` should report a data operation marker left in an element's `data` (it is resolved only inside `/merge`).
