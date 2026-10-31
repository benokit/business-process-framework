# entity-states

The `state` [trait](../entities/README.md#traits): an entity's lifecycle as named states. Transitions are declared data, so which changes are legal is checked in one place, can be granted one by one in [authorization](../../services/authorization/README.md) and shown by `bpf explain`, instead of being scattered through update code. Independent aspects of the lifecycle are separate dimensions.

- The trait `state`, configured by an `entity-states-model`: `{ states: { <dimension>: { <state>: true } }, transitions?: { <name>: { <dimension>: { <from state>: <target state> } } }, initialStates?: { default, <name>: { <dimension>: value } } }`. A transition changes every dimension it lists, and only if all of them have their current state among its sources (a transition listing several dimensions is coupled); from different source states it may lead to different targets. Everything is a map, so a subtype edits a model with the [data algebra](../../../design/data-composition.md): `{ "cancel": { "status": { "suspended": "cancelled" } } }` adds a source state, `{ "cancel": { "/unset": true } }` removes a transition. `validate()` reports sources, targets and initial states a dimension doesn't declare.
- `data.state` is `{ <dimension>: value }`, set on `create` from `initialStates.default`, or from the initial state named in the create input (`traits: { state: "<name>" }`).
- An entity type with the `state` trait exposes the operation `transition({ businessKey, revision, transition })`: it runs the operation `transition` of the `state` trait (`traitOperation`), which computes the target state from the record at `revision` and writes it as command `<transition>`. The kind `stateful-entity-type` declares it; a kind that has to expose other operations too declares `transition` with the same node. `validate()` reports an entity type with states and no `transition`.
-  a record no longer at `revision` gives `conflict`. Errors: `not-found` (no entity type), `invalid` (no such transition), `conflict` (not allowed from the current state, revision mismatch).
- The schema `entity-transition` is the names of every transition of every entity type, registered at load, and types the `transition` input: a transition is a closed set of values, so [authorization](../../services/authorization/README.md) can grant transitions and `validate()` knows them.

```json
{ "id": "order", "kind": "entity-type", "data": { "traits": { "state": { "configuration": { "states": { "status": { "draft": true, "confirmed": true } }, "transitions": { "confirm": { "status": { "draft": "confirmed" } } }, "initialStates": { "default": { "status": "draft" } } } } } } }
```

## Operations by state

Besides transitions, the model says in which states the operations an entity exposes are possible, as a rule of the process that holds for everyone: `operations` maps the name of an operation of the entity type (`update`, `delete`, `putSegment`, … any public operation other than `read`, `create` and `transition`) to the states it is possible in, in the shape of the sources of a transition (`{ <dimension>: { <state>: true } }`; with several dimensions all must hold). An operation the model doesn't list is possible in every state. Trait operations are private to the entity and have no name here.

```json
"operations": { "update": { "status": { "draft": true } }, "delete": { "status": { "draft": true, "cancelled": true } } }
```

- The fill `refuse-operations-outside-their-states` (slot `guards`) refuses an operation outside its states with `conflict`. It judges the record as it is and decides on the `entityOperation` of the change.
- A subtype edits it with the [data algebra](../../../design/data-composition.md), like `states` and `transitions`. `validate()` reports a name that is no public operation of the entity type (or one of `read`, `create`, `transition`), and states a dimension doesn't declare.
- Who may do an operation the states allow is a [permission](../../services/state-permissions/README.md), apart from this.

## Permission states

One state dimension of a model is its **permission state**: the value that [state-permissions](../../services/state-permissions/README.md) grants name. `permissionDimension` names it; it defaults to the only dimension of the model, otherwise to `status`.

```json
"states": { "status": { "draft": true, "issued": true }, "payment": { "open": true, "paid": true } },
"permissionDimension": "payment"
```

- `validate()` reports a permission dimension the model doesn't declare, which includes a model with several dimensions and none named `status`.
- `$func/permission-state` gives the permission state of a record's state for an entity type, `$func/permission-state-names` the union of the states of the permission dimensions of every entity type.
