# entity-states

The `state` [trait](../entities/README.md#traits): an entity's lifecycle as named states.

- The trait `state`, configured by an `entity-states-model`: `{ states: { <dimension>: [values] }, transitions?: { <name>: { from: { <dimension>: [values] }, to: { <dimension>: value } } }, initialStates?: { default, <name>: { <dimension>: value } } }`. `validate()` reports states a model uses but doesn't declare.
- `data.state` is `{ <dimension>: value }`, set on `create` from `initialStates.default`, or from the initial state named in the create input (`traits: { state: "<name>" }`).
- `entity-states.transition({ entityType, businessKey, revision, transition })` computes the target state from the record at `revision` and writes it as command `<transition>`; a record no longer at `revision` gives `conflict`. Errors: `not-found` (no entity type), `invalid` (no such transition), `conflict` (not allowed from the current state, revision mismatch).
- The schema `entity-transition` is the names of every transition of every entity type, registered at load, and types the `transition` input: a transition is a closed set of values, so [authorization](../authorization/README.md) can grant transitions and `validate()` knows them.

```json
{ "kind": "slot-fill", "data": { "target": "order", "slot": "traits", "value": { "trait": "state", "configuration": { "states": { "status": ["draft", "confirmed"] }, "transitions": { "confirm": { "from": { "status": ["draft"] }, "to": { "status": "confirmed" } } }, "initialStates": { "default": { "status": "draft" } } } } } }
```
