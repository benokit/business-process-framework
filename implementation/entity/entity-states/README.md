# entity-states

The `state` [trait](../entities/README.md#traits): an entity's lifecycle as named states.

- The trait `state`, configured by an `entity-states-model`: `{ states: { <dimension>: { <state>: true } }, transitions?: { <name>: { <dimension>: { <from state>: <target state> } } }, initialStates?: { default, <name>: { <dimension>: value } } }`. A transition changes every dimension it lists, and only if all of them have their current state among its sources (a transition listing several dimensions is coupled); from different source states it may lead to different targets. Everything is a map, so a subtype edits a model with the [data algebra](../../../design/data-composition.md): `{ "cancel": { "status": { "suspended": "cancelled" } } }` adds a source state, `{ "cancel": { "/unset": true } }` removes a transition. `validate()` reports sources, targets and initial states a dimension doesn't declare.
- `data.state` is `{ <dimension>: value }`, set on `create` from `initialStates.default`, or from the initial state named in the create input (`traits: { state: "<name>" }`).
- `entity-states.transition({ entityType, businessKey, revision, transition })` computes the target state from the record at `revision` and writes it as command `<transition>`; a record no longer at `revision` gives `conflict`. Errors: `not-found` (no entity type), `invalid` (no such transition), `conflict` (not allowed from the current state, revision mismatch).
- The schema `entity-transition` is the names of every transition of every entity type, registered at load, and types the `transition` input: a transition is a closed set of values, so [authorization](../../services/authorization/README.md) can grant transitions and `validate()` knows them.

```json
{ "id": "order", "kind": "entity-type", "data": { "traits": { "state": { "configuration": { "states": { "status": { "draft": true, "confirmed": true } }, "transitions": { "confirm": { "status": { "draft": "confirmed" } } }, "initialStates": { "default": { "status": "draft" } } } } } } }
```
