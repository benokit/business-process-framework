# entity-states

The `state` [trait](../entities/README.md#traits): an entity's lifecycle as named states. Transitions are declared data, so which changes are legal is checked in one place, can be granted one by one in [authorization](../../services/authorization/README.md) and shown by `bpf explain`, instead of being scattered through update code. Independent aspects of the lifecycle are separate dimensions.

- The trait `state`, configured by an `entity-states-model`: `{ states: { <dimension>: { <state>: true | { initial?, to? } } }, transitions?: { <name>: { <dimension>: { <from state>: <target state> } } }, initialStates?: { default, <name>: { <dimension>: value } } }`. A transition changes every dimension it lists, and only if all of them have their current state among its sources (a transition listing several dimensions is coupled); from different source states it may lead to different targets. Everything is a map, so a subtype edits a model with the data algebra: `{ "cancel": { "status": { "suspended": "cancelled" } } }` adds a source state, `{ "cancel": { "/unset": true } }` removes a transition. `validate()` reports sources, targets and initial states a dimension doesn't declare.
- `data.state` is `{ <dimension>: value }`, set on `create` from `initialStates.default`, or from the initial state named in the create input (`traits: { state: "<name>" }`).
- An entity type with the `state` trait exposes the operation `transition({ businessKey, revision, transition })`: it runs the operation `transition` of the `state` trait (the node `exposes`), which computes the target state from the record at `revision` and writes it as command `<transition>`. The kind `stateful-entity-type` declares it and `stateful-body-entity-type` adds `update`; a kind that has to expose other operations too declares `transition` with the same node. `validate()` reports an entity type with states and no `transition`.
-  a record no longer at `revision` gives `conflict`. Errors: `not-found` (no entity type), `invalid` (no such transition), `conflict` (not allowed from the current state, revision mismatch).
- The schema `entity-transition` is the names of every transition of every entity type, registered at load, and types the `transition` input: a transition is a closed set of values, so [authorization](../../services/authorization/README.md) can grant transitions and `validate()` knows them.
- A model used by several entity types is an element of the kind `state-machine` (shaped as the model), which an entity type takes as its configuration with `{ "/ref": "<id>" }` and edits with `/merge`; the demo's [approvals](../../../demo/approvals/approvals.eson) show it.

```json
{ "id": "order", "kind": "stateful-entity-type", "data": { "traits": { "state": { "configuration": { "states": { "status": { "draft": true, "confirmed": true } }, "transitions": { "confirm": { "status": { "draft": "confirmed" } } }, "initialStates": { "default": { "status": "draft" } } } } } } }
```

## Reading the state of a record

Other packages read the state through the trait, wherever it sits ([entities](../entities/README.md#traits)): `$func/record-state` gives the state of a record (`null` without the trait) and `$func/state-moved` `{ before, after, dimension, from, to }` tells whether a write moved a dimension from one value to another (`before` is `null` on a create, so it is false). A reaction that waits for a move, such as those of [amendments](../entity-amendments/README.md), uses it.

## Restricting the moves of a dimension

A state is `true` (no restriction) or `{ initial?: true, to?: [<state>] }`. The kind that introduces a dimension declares its graph there, in its `fixed` configuration, so that no subkind or instance can change it (the data algebra reports it as a conflict naming the owner) and every process that uses the dimension moves along it:

```json
"states": { "versionStatus": {
    "pending":   { "initial": true, "to": ["applied", "discarded"] },
    "applied":   { "to": ["discarded"] },
    "discarded": { "to": [] }
} }
```

- `to` lists the states a transition may lead to from this one (`[]` ends the dimension there); a transition that keeps the state is always allowed. Once any state of a dimension declares `to`, all of them must, so a state an instance adds to the dimension without moves is reported.
- `initial: true` marks the states a record may start in. Once any state is marked, an initial state (`initialStates`, the default or a named one) that puts the dimension elsewhere is reported.
- `validate()` reports a transition that moves a dimension against its `to`, an initial state outside the marked ones, a `to` that names an undeclared state, and a state without `to` in a dimension that restricts moves. A model that passes can only be moved along the declared graph, so nothing is checked at run time. The process around the dimension (its names, the other dimensions it moves together with) stays free.

## Operations by state

Besides transitions, the model says in which states the operations an entity exposes are possible, as a rule of the process that holds for everyone: `operations` maps the name of an operation of the entity type (`update`, `delete`, `putSegment`, … any public operation other than `read`, `create` and `transition`) to the states it is possible in, in the shape of the sources of a transition (`{ <dimension>: { <state>: true } }`; with several dimensions all must hold). An operation the model doesn't list is possible in every state. Trait operations are private to the entity and have no name here.

```json
"operations": { "update": { "status": { "draft": true } }, "delete": { "status": { "draft": true, "cancelled": true } } }
```

- The fill `refuse-operations-outside-their-states` (slot `guards`) refuses an operation outside its states with `conflict`. It judges the record as it is and decides on the `entityOperation` of the change.
- A subtype edits it with the data algebra, like `states` and `transitions`. `validate()` reports a name that is no public operation of the entity type (or one of `read`, `create`, `transition`), and states a dimension doesn't declare.
- Who may do an operation the states allow is a [permission](../../services/state-permissions/README.md), apart from this.
- `operations` and `processDimension` are part of the model. A slot `operationStates` keyed by operation name (own package), `locks` on state declarations and lock dimensions were each tried against the demo: each touched more places to express the demo's rules than the one entry here, and none checked more than `validate()` does here.

## Process states

One state dimension of a model is its **process state**: the value that [state-permissions](../../services/state-permissions/README.md) grants name. `processDimension` names it; it defaults to the only dimension of the model, otherwise to `status`.

```json
"states": { "status": { "draft": true, "issued": true }, "payment": { "open": true, "paid": true } },
"processDimension": "payment"
```

- `validate()` reports a process dimension the model doesn't declare, which includes a model with several dimensions and none named `status`.
- `$func/process-state` gives the process state of a record's state for an entity type, `$func/process-state-names` the union of the states of the process dimensions of every entity type.
