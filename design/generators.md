# Generators: entities that generate entities

Status: **built** (R6.28 to R6.30; every question Q-G1 to Q-G11 is decided; the last section lists what building changed). This file owns the design of generalizing the `amendmentTypes` slot of [entity-amendments](../implementation/entity/entity-amendments/README.md); the work is [R6.28](refactoring-plan.md) and [R6.29](refactoring-plan.md), the finding [F68](critique.md). When built, the mechanism moves into the [entities README](../implementation/entity/entities/README.md) and the generators into the [entity-amendments README](../implementation/entity/entity-amendments/README.md), and this file keeps the reasoning.

## Idea

An entity instance has generative capabilities: it can produce new instances of arbitrary kinds. A trait holds the **generative declarations**; each says which kind the new entity has, how its initial data is made, and which **private interaction interface** the new entity has back to the entity that generated it. An amendment is the special case in which the generated entity is an amendment, its interface is `apply` and `revert`, and the source is an entity with a versioned body.

## What the amendment process was made of (before R6.29)

| Part | Generic? | Before |
|---|---|---|
| A slot of declarations `{ type, open, input, apply, revert }` filled by `slot-fill` elements | yes | `amendmentTypes` of `versioned-entity-type` |
| `propose`: checks the source's state, finds the declaration, creates the entity | yes | operation of `entity-amendments` |
| A link on the generated entity to its source | yes | trait `amendment-link` `{ amendedType, amendedKey, amendedRevision, effectiveFrom }`; the last field belongs to amendments |
| Creation only through `propose` | yes | guard on `create` of `amendment-entity-type`, open while the context `amending` is bound; only `entity-amendment-process` manages it |
| The interface: trait operations on the source, run when the generated entity moves | yes, in form | `apply`, `revert`, `close` as reactions on the moves of `versionStatus`; the source takes them through `applyAmendment`, `revertAmendment` |
| The source lists in its model which states allow it | yes | `operations: { applyAmendment: { status: { active: true } } }` |
| One open amendment, numbered without gaps | no | trait `amendment-ledger`, `close` |
| The entity must not have changed since the proposal | no | `amendedRevision` against the revision, in `apply` |
| `pending`, `applied`, `discarded` | no | dimension `versionStatus` of `amendment-entity-type` |
| `body.amend` and `body.remove` by default | no | `amendment-fill` |

## The general mechanism: trait messages

The problem is not the generator's. A trait sometimes has to change its entity as if the change came from the outside (checked by the state model, guarded, derived, reacted to, one revision, one event) while no outside caller may do it: the change is an internal process of the entity, a metamorphosis, triggered by something that happened in the entity's own traits or in a related entity's. Today a trait can add operations to the change in progress (`derive`, [derived traits](../implementation/entity/entities/README.md#derived-traits)), but cannot start a change of its own entity, and the only way in from elsewhere is a public operation of the type (`applyAmendment`), which anyone with the right to call it may call with any list.

Proposal, on `trait-container` (so for every entity type, used only by traits that want it):

- **`_ctx.trait`**, `{ entityType, businessKey, key }`, managed by `trait-container`: bound while a hook or an operation of a trait runs, naming the trait that runs. It is read-only, and only the container binds it, so code anywhere can trust it ([context](../implementation/core/README.md)).
- **`deliver({ entityType, businessKey, trait, message, input? })`**, an operation of `trait-container`. It refuses (`forbidden`) unless `_ctx.trait` is bound, so it is reachable from a trait and from nothing else: no route, no caller outside. Pipelines use it through the node `deliver`, a template `within: entity-trait`, so `validate()` reports it anywhere but in a trait (Q-G9). It calls the operation `receive` of the target trait `trait` with `{ entityType, key, configuration, sender, message, input, record }` (`sender` is the `_ctx.trait` of the caller, the verified identity of the sending trait, with the entity it sits on). `receive` decides: it throws to refuse, or returns the trait operations to apply, `[{ key, operation, input }]`, or `null`.
- The container applies the returned operations as **one internal change** to the target entity: through `applyChange` like any write (guards, derives, reactions of traits and slots, one revision, one event), with `change.origin = { sender, trait, message }`, so a hook can tell it from an outside write. What it skips is only what belongs to a caller: authorization of operations and the HTTP surface.
- **The state model still decides** when. A message is listed in the model's `operations` under `<trait key>/<message>`, per state, as `update` is: `"operations": { "generator/effect": { "status": { "active": true } } }` (Q-G8). That keeps "an entity can be amended in these states" a fact of the model.
- **The transaction** is the caller's: a `deliver` from the `react` of a trait runs inside the transaction of the move that caused it, so a failure rolls the move back.
- A trait can send a message to its own entity (`sender` equals the target): the same path serves a trait that must change its entity by its own rule after the fact, which `derive` can't because the change is already over.

- **Trait entries (Q-G11)**: `enter({ businessKey, trait, entry, input? })` runs an operation of a trait of an entity as that trait, but only an operation the trait lists in `entries`; it is how a process of a trait starts from outside. The guards run first on a `trait` change `<trait key>/<entry>` (the state model gates it as it gates a message), and the whole is one transaction. Built in R6.30.

What this gives that nothing else does: the receiving trait sees who sent (the sender is not a parameter), reads the sender's stored record if it needs to, and writes only what it returns. A trait trusts a sender only as it chooses; a trait that never defines `receive` can't be reached.

## Design

Two traits, no entity type built around a slot. Any entity type takes the capability by naming the traits ([traits](../implementation/entity/entities/README.md#traits)); nothing else changes in it.

### The trait `generator` (the source)

A trait of cardinality `one`, key `generator`. Its `configuration` is `{ declarations: { <name>: { type, open?, input?, effects? } } }`, a declaration being:

```
{ type, open?, input?, effects? }
```

- `type`: the kind of the entity to generate; it has the trait `generated`.
- `open`: maps `{ entity, input }` (the source as its type reads it, and the `input` of the request) to the initial traits of the new entity. Without it, `input` is the body.
- `input`: the id of a schema that checks the input of the request before `open` runs.
- `effects`: named lists of trait operations `{ key, operation, input }` on the source, whose `input` maps `{ source, generated, link }`. Amendments have the effects `apply` and `revert`; a renewal has none.

Declarations are contributed as paths of the use are: in the `traits` of the entity type, in the `fixed.traits` of its class, or by fills of the slot `traits` from anywhere, `{ trait: "generator", configuration: { declarations: { "premium-adjustment": { ... } } } }`; a fill adds a path to the one use, and the deep union of contributions does the rest (the same name with another content is a conflict). The fills of the demo's `amendmentTypes` become such fills. `validate()` also checks a declaration as it checks a fill today: `open` against the data of `type`, the `input` of an effect item against the input of its trait operation on the source, an item whose trait or operation the source hasn't, a trait used twice in a list.

The generic trait stores nothing (a specialisation may, as the amendment one does). It defines `receive` ([trait messages](#the-general-mechanism-trait-messages)): on the message `effect`, with `input: { effect }`, it takes the sender's record, refuses unless the link of the sender names this entity, this declaration and the current revision of the source, and the sender is in the state the binding of the effect says (a pending amendment can't apply); it returns the items of the declaration's effect, mapped over `{ source, generated, link }`. It is the only way the declaration writes the source.

### The trait `generated` (the generated entity)

A trait of cardinality `one`, valued: its value is the link, fixed at creation:

```
{ sourceType, sourceKey, sourceRevision, generator, context }
```

`context` is free data of the request that the effects read (`effectiveFrom` for amendments). Its `configuration` binds the moves of the generated entity to the effects of the declaration:

```
{ "apply": { "versionStatus": { "pending": "applied" } }, "revert": { "versionStatus": { "applied": "discarded" } } }
```

- `guard` on `create`: refuses unless `_ctx.trait` is the `generator` use of the source that the link to be written names (the `amending` guard of today), so the entity exists only through the entry `generate`.
- `react`: after a write, finds the effect whose binding the change satisfies and `deliver`s the message `effect` to the `generator` use of the source named by the link, in the transaction of the move, so a failure rolls the move back. Behaviour of the move stays with the generated entity's own state model; behaviour on the source stays with the declaration.
- The trait has only `initialize`, so no trait operation writes the link, and `applyTraitOperations` is private.

### The entry `generate`

`generator` lists `generate` in its `entries`, so `enter({ businessKey, trait: "generator", entry: "generate", input })` on the source starts it (the HTTP route of an application targets that; the state model lists `generator/generate`, authorization names the action). `input` is `{ generator, input?, context? }`: the name of the declaration, the request's input and the free data that the link keeps. The operation runs as the trait, in one transaction:

1. finds the declaration of that name (`invalid` otherwise) and checks `input` against its schema;
2. makes the initial traits with `open`;
3. asks the specialisation for what it adds to the generation (`admit`: the amendment generator checks and writes its ledger by a message to its own entity, and answers the key of the new entity and the revision of the source after its write; the generic one answers the key from the request and the current revision);
4. creates the entity, with the link, through `create` (its `guard` checks that `_ctx.trait` is the `generator` use of the source the link names);
5. returns it.

There is no process element and no context of its own: Q-G11.

### Amendments as a special case

The generic `generator` knows no policy. What the amendment process adds is a **specialisation of the trait**, `amendment-generator` (a kind extending `generator`), which an amendable entity type uses instead of the generic one:

- **one open at a time, numbered without gaps:** it refines `generate`, checking and updating the ledger (today's `amendment-ledger` value, `{ last, open }`) and giving the key `<businessKey>-<nnn>`;
- **the revision check:** it refines `receive` for the effect `apply`: `conflict` if the source is no longer at the `sourceRevision` of the link;
- **closing:** it clears `open` when the amendment is applied or discarded, in `receive` as well;
- **defaults:** an effect without items is `body.amend` (`apply`) and `body.remove` (`revert`) with the amendment's body from the `effectiveFrom` of the link's `context`.

`amendment-entity-type` has the trait `generated` with the bindings above, and keeps `versionStatus`. `versioned-entity-type` uses `amendment-generator` for its amendment types. The slot `amendmentTypes` is removed (Q-G2); the demo's fills change to `traits` fills of the same content, naming `amendment-generator`.

## What guarantees that only the generating entity is interacted with

The two lists below describe the amendments as they were before R6.29; the requirements after them are met by the built design (the tests named in the last section pin them).

### What held before R6.29

Established by the tests `keeps the link of an amendment` and `trusts the amendment record given to apply` in [entity-amendments.test.js](../implementation/entity/entity-amendments/test/entity-amendments.test.js) and by reading [entity-amendments.eson](../implementation/entity/entity-amendments/elements/entity-amendments.eson):

1. **Creation.** The guard on `create` of an amendment throws `forbidden` unless `amending` is bound. Only the kind that manages the key, `entity-amendment-process`, binds it (`withContext`), and `propose` binds it from the request. An amendment exists only through a `propose` on its source.
2. **The link is the identity.** The target of every reaction (`apply`, `revert`, `close`) is read from the link of the amendment that moved, not from a parameter. The trait `amendment-link` has only `initialize`; its other operations don't exist and `applyTraitOperations` is private, so no trait operation writes it, and an `update` of the amendment leaves it as it was (tested).
3. **Checks on the source.** `apply` is a `conflict` if the revision of the source isn't the `amendedRevision` of the link; `close` is a `conflict` unless the amendment is the open one of the ledger; `body.remove` removes the version of its own `ref` only.

### What did not hold before R6.29

Both tested, both unlike what the design above promises:

- **`entity-amendments.apply` trusts the record it is given.** Given the stored but still pending amendment of `g-2`, it applies the version to the entity, and the amendment stays `pending`: the version is written without the move that should cause it. Given a record whose link names another entity (`g-3`) whose revision it also gives, it writes the version to that entity; then `close` fails with `conflict`, but the version stays: a call from outside the transition is not one transaction. The only protection is that no HTTP route exposes `apply`, `revert` and `close`, and the authorization of operations.
- **`applyAmendment` of the source takes any list of trait operations.** Called directly, it amends the entity with an arbitrary `body.amend` that no amendment asked for (tested). The state model and authorization of operations are the only protection.

### What the design requires, and what meets it

1. **No record is given.** The effect is a message from the `generated` trait of the generated entity, whose identity is `_ctx.trait`; the `generator` trait reads the sender's stored record itself and takes the source from its link, so a caller can't give a record. It also checks that the sender is in the state the binding says (`versionStatus` is `applied` for `apply`), so a pending amendment can't apply.
2. **The link is fixed.** Kept as it is today: a trait with no operation but `initialize`, which is private to the type.
3. **The source accepts effect writes only from a trait.** `applyAmendment` and its like disappear as public operations: the writes on behalf of a generated entity are the internal change of `deliver`, reachable only while `_ctx.trait` is bound, and the items are what the `generator` trait returns for a declaration, never a list from a caller. `_ctx` is read-only and only `trait-container` binds it, so the receiver can trust it.
4. **One transaction.** The effect and the move that causes it run in the transaction of the transition, so a failing `close` rolls the effect back. Today the reactions do (tested: `rolls the activation back when the state cannot move`); a direct call doesn't, and after 1 and 3 there is no direct call.

## Open questions

- **Q-G1.** Decided: where is the link between a move of the generated entity and an effect of the source declared? An effect has two halves. The trigger says *when*: which move of the generated entity fires it (an amendment's `versionStatus: pending → applied` fires `apply`). The body says *what*: which trait operations are written on the source. One option puts both in the declaration on the source; the other keeps the body there and puts the trigger in the generated entity's own kind. We take the second: the trigger is the configuration of the trait `generated`, `{ "<effect>": <move> }`, on the generated type, and the declaration of `generator` only names the effects and says what each writes. Why: the move is a fact of the generated entity's state model, which the generated kind owns, so a kind that changes its process changes its bindings in one place; and the same generated kind can serve several sources whose declarations differ in what an effect writes. Consequence: a declaration cannot say when its effect fires, and an effect name that no binding mentions never fires (`validate()` should report it).
- **Q-G2.** Decided: `amendmentTypes` is replaced by `generator` uses; the demo's fills are rewritten as `traits` fills, so there is one way. Nothing keeps the slot as sugar.
- **Q-G3.** Decided: none of the policies (one open at a time, numbering, revision check) is an option of the generic declaration. Each is behaviour of a particular process, and behaviour belongs to kinds: they are modelled on the generator side, in a specialisation of the trait (`amendment-generator`). A second process with its own rules writes its own specialisation; the generic `generator` stays free of them.
- **Q-G4.** Decided: with a context key gating creation and the writes on the source (`amending` today), should it be one context for every generator or one per kind of source? One shared context is simple, but a guard couldn't tell the generators apart; one per kind could, but multiplies contexts. The answer is neither: [trait messages](#the-general-mechanism-trait-messages) replace the key. `_ctx.trait` names the trait that is running, and the receiving trait decides from that sender, so there is no `generating` to choose.
- **Q-G5.** Decided: the names stay (the process `entity-generation` is gone with Q-G11, `generated-entity-creator` and `trait-messages` are the typed hops). The question was whether they are right. Proposed, by the [programming rules](../.claude/skills/programming-rules/SKILL.md) (a subkind is named after what it specialises followed by its base kind's id, an instance after what it is followed by its kind's id): the kinds `generator-trait`, `generated-trait` and `entity-generation-process`, with the instances `generator`, `generated` and `entity-generation`; the specialisation is the kind `amendment-generator-trait` with the instance `amendment-generator` (this file says "kind" loosely where it means the instance). `generated` names the result, not the trait's job, but it is a marker the entity holds with the link to its source, and the pair reads well. The mechanism: `deliver` and `receive` (not `send`, which suggests asynchronous delivery: the call is synchronous, inside the sender's transaction) and `_ctx.trait` (an identity `{ entityType, businessKey, key }`; `sender` would suit the receiver but not the code that is sending). Kept.
- **Q-G6.** Decided: a general mechanism of traits, not the generator's ([trait messages](#the-general-mechanism-trait-messages)). The design belongs in [entities](../implementation/entity/entities/README.md) when agreed; this file owns it until then.
- **Q-G7.** Decided: the ledger is the value of `amendment-generator` itself. The trait is of cardinality `one` with the declarations as a map in its configuration (above), so one use holds one value, `{ last, open }`, for the whole entity, which is what "one open for the whole entity" and gap-free numbering need. An earlier version had one use per declaration (cardinality `many`), which would have given each declaration a ledger of its own; that was the only obstacle, and it is gone. The separate trait `amendment-ledger` and its `guard` (accepts only `open` and `close`) fold into the specialisation: its `guard` keeps the value's shape, and only its own `generate` and `receive` write it.
- **Q-G8.** Decided, with both recommendations: (a) the model gates messages under `<trait key>/<message>`; (b) `deliver` takes no `revision`. Two questions about trait messages.
  - **(a) How does the state model gate a message?** Today the model's `operations` lists entity operations per state (`update` in draft, `applyAmendment` in active) and the `state` trait's guard refuses one outside its states. A message is not an entity operation, so the model has no name for it. Either the model lists messages under a key (for the model's rule "an entity can be amended in these states" to stay in one visible place, checkable by `validate()`), or the receiving trait checks the state itself (the model unchanged, but the rule hidden in trait code and reimplemented by every trait). Recommended: the model, with the key `<trait key>/<message>` (`generator/effect`): trait keys are unique in an entity, so the key is unambiguous, whereas `receive/<message>` is not when two traits receive a message of the same name. Listed keys are restricted to their states and unlisted ones are not, as for operations today (to be verified).
  - **(b) Does a message carry a `revision`?** An ordinary write carries the revision the caller saw, so a concurrent change is refused. The sender of a message saw the generated entity, not the target, so it has no revision of the target to give; and the amendment's rule (the source is still at the `sourceRevision` of the link) is that process's policy, which a payment settling an invoice, say, would not want. Recommended: no parameter. `deliver` reads the target and applies the change at the revision it just read inside the transaction (a race still conflicts), and a stricter rule is the receiver's own check in `receive`.
- **Q-G9.** Decided: ambient `_ctx.trait`, with `deliver` as a keyword valid only in traits (the recommendation at the end of this entry). How does the receiver know who sent a message? Now: the container binds `_ctx.trait` while a hook or operation of a trait runs, and `deliver` passes it as `sender`, so nobody supplies it. The weakness is that `_ctx` is ambient: every function the hook calls sees the identity too, and can call `deliver` as if it were the trait (a confused deputy). The guarantee of this design is that only the generating entity acts through the interface, so the identity should be as narrow as that. Options: (1) ambient `_ctx.trait`; (2) an explicit `sender` parameter checked against `_ctx.trait`: no narrower, since whatever reads the context can pass it; (3) static scope: `deliver` as a node form valid only `within` the pipelines of a trait. Checked against [core](../implementation/core/README.md) and its code: (3) is half available. A template with `within: entity-trait` is valid only in operations of a kind extending `entity-trait` (`node-outside-context` elsewhere), and a hook gets its identity as input from the container (`entityType`, `key`, `change`), so the template can supply the sender from there. But it doesn't close the runtime gap: `private` binds to the element a pipeline runs for, which for a trait's hook is the trait, not the container, so the container's `deliver` can't be private to the template; and the right to bind a context key goes to the author of the code (`context-right`), the template's author being the template, not a trait. So any code that can `invoke` the operation can still call it, refused only for want of `_ctx.trait`. Residual limit, whichever is chosen: the code that runs under a trait's hook can pose as it, and any trait's own pipeline can bind the key for any identity (the right is the kind's, not one trait's). Traits are the application author's code; the limit is a statement about trust, not a hole an outside caller can use. Recommended: (1) with the keyword of (3) as the only documented way in, so that ordinary pipelines have no `deliver` node and `validate()` reports it outside traits, and the limit stated in the README that takes over this design.
- **Q-G10.** Decided: yes. An internal change skips the authorization of operations, because no caller is asking, but the principal whose move caused the effect (the user of the transition that fired it) stays in `_ctx` for the whole transaction and is recorded with the change, so the audit of the event names who caused it, next to `change.origin` (the sending trait and the message). How the event carries it is for the implementation to settle with the existing event data.
- **Q-G11.** Decided: option (3). Found while building R6.29: how does `generate` run *as the trait*? The design has `generate` as an operation of the process `entity-generation`, and says it creates the entity "running as that trait". It cannot: only `trait-container` binds `_ctx.trait`, so a process element's operation runs with no trait identity, and then it cannot `deliver` to the source (to write the ledger) and the `generated` guard on `create` has no identity to check. Options: (1) a `generating` context managed by the generator-trait kind, bound by trait code, with `generate` an operation of the trait element: this brings back a second context key and leaves the ledger write to a public exposed operation (as `writeLedger` is today); (2) the revision the link records is read before the ledger write, so the check "the source did not change since the proposal" has to allow for the proposal's own write; (3) a general **trait entry** on `trait-container`, `enter({ businessKey, trait, entry, input })`: it runs the operation `entry` of the trait of that entity *as that trait* (`_ctx.trait` bound, as for a hook), but only an operation the trait lists as an entry (`entries: ["generate"]` in the trait's data); it is the way a process of a trait starts from outside, gated like a message (the state model lists `<trait key>/<entry>`, authorization names the action) and in one transaction. `generate` then is an ordinary pipeline of the trait: it `deliver`s a ledger write to its own entity (and gets the record with the new revision for the link), creates the generated entity (the `generated` guard checks that `_ctx.trait` is a `generator` use of the source its link names), and returns it; no `generating`, no `entity-generation` process, no public ledger operation. Recommended: (3). It costs one general mechanism, usable by any trait that has a process of its own (the states trait's `transition` is an entry in all but name), and it is the only option that keeps the guarantee of Q-G9 for creation.

## What building R6.29 changed or settled

Findings while building, none of which changes a decision above:

- **Messages are named after the effect.** The message a generated entity sends is the name of the effect (`apply`, `revert`, `close`), not a fixed `effect` with a parameter, so the state model gates each effect on its own: `generator/apply` is listed for the states in which the source may be amended and `generator/revert` is left out, as `revertAmendment` was, so annulling a cancellation of a cancelled contract works. The generic trait's `receive` takes the effect from the message name.
- **Fills may repeat on one key.** Fills of the slot `traits` that name only a key (no `trait`) specialise the use and may repeat, their contributions united by the existing algebra; fills that inject a trait are still `used twice` when repeated ([entities](../implementation/entity/entities/README.md)). Without this, each declaration could not be a fill of its own.
- **Operations of a kind are overridden by implementing abstract ones.** `generator-trait` has the hooks `admit`, `guardEffect`, `settle`, `effectsOf`, `ownMessage` as abstract operations, and `plain-generator-trait` and `amendment-generator-trait` implement them (the framework does not let a subkind redefine an implemented operation).
- **`open` gives the initial traits**, `{ body: … }`, as the design says; the default is `{ body: <input> }`.
- **The scope of the items of an effect** is `{ source, generated, link }` (the source as its type reads it, the generated entity as stored, its link); the free data of the request is `link.context` (`effectiveFrom` for amendments).
- **The creation guard** reads `_ctx.trait.caller`: the container keeps the trait that was running when it binds the one whose hook runs (`caller`), because the guard of `generated` runs under the identity of the `generated` trait, and the generator is the one that called.
- **Typed hops for effects.** A target the pipeline computes (an entity type from a declaration, from a link) stands for every element when the effect check cannot type it, and that breaks the bound of a transaction. The operations that create, deliver, enter and preview go through the element `trait-messages` (and `generated-entity-creator`), whose contract types the entity type `@ref/trait-container`.
- **One revision less.** The ledger is closed in the change that applies the effect (`settle`), where it was a change of its own, so activating a cancellation takes one revision.
- **Preview** is an entry (`preview`) that returns the commands, through the operation `previewOperations` of the container (which, like `deliver`, needs a trait).
- **The direct calls of the gaps are gone**: `apply`, `revert`, `close`, `applyAmendment`, `revertAmendment`, `previewAmendment` and `writeLedger` no longer exist; the tests `keeps the link of an amendment` and `answers a message of an amendment that is not the amended entity's with forbidden, and takes no record from a caller` of [entity-amendments.test.js](../implementation/entity/entity-amendments/test/entity-amendments.test.js) pin the guarantees.
