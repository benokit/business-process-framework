# entity-amendments

Changes to an entity with a versioned body as entities of their own: an amendment is proposed, applied from a date, may be reverted, or is discarded without having taken effect. The mechanism of versions is the trait `body` of [entities](../entities/README.md#versioned-body); this package is the trait `amendable`.

- **`amendable`** (trait, kind `amendable-trait`): its value is the ledger `{ last, entries }`: the number of the last amendment and one entry `{ key, type, effectiveFrom, proposedAt, status }` per amendment, `status` being `pending` (proposed), `applied` (its version is in the body) or `discarded`. At most one entry is pending. Its operations, which only the entity type runs, are `open` (adds a pending entry, `conflict` while one is pending) and `settle` (moves an entry from a status to another, `conflict` if it isn't in the first one, or, when `revision` is given, if the entity is no longer at the `proposedAt` of the entry).
- **Configuration** of the trait, on the entity type: `{ <amendment entity type>: { mapping?, apply?, revert? } }`, the amendment types the entity allows, each with mappings over `{ entity, amendment, effectiveFrom }` (`entity` and `amendment` are records; `mapping` has `{ entity, input }`):
  - `applicable`: whether the amendment may be applied now (`conflict` when not); always when absent. The demo asks for the review: the amendment is `issued`.
  - `mapping`: the body of the amendment from `{ entity, input }`; the input as it is when absent.
  - `apply`: the trait operations `[{ key, operation, input }]` that make the amendment take effect; the `amend` of the body with the amendment's body from `effectiveFrom`, the amendment's key as `ref`, when absent.
  - `revert`: the trait operations that undo it; the `remove` of that date and `ref` when absent.
- **Operations** of the trait, all public and plans ([public and private operations](../entities/README.md#public-and-private-operations)), run with `run({ businessKey, revision?, trait: "amendable", operation, input })` of the entity type. The state model's `operations` says in which states each may run (`propose`, `apply`, `revert`, `discard`).
  - **`propose({ amendmentType, effectiveFrom, input })`** creates the amendment and adds the pending entry in one transaction: `invalid` for a type the entity doesn't list, `conflict` while an amendment is pending, so concurrent proposals can't both win, and nothing is left behind if the amendment can't be created (its body is checked against its own schema). The amendment is named `<businessKey>-<number>` (`%03d`), so the numbers have no gaps. `proposedAt` is the revision the ledger write makes.
  - **`apply({ amendment })`**: the items of `apply`, then `settle` pending → applied with the revision check: `conflict` if the entity moved on since the proposal, the amendment isn't pending or its kind's `applicable` doesn't hold; all in one change, with the operation's name as its `entityOperation`. The amended version must not be before the last one (`conflict` otherwise).
  - **`revert({ amendment })`**: the items of `revert`, then `settle` applied → discarded. Only the latest version can go, so reverts run in the reverse order of applications (`conflict` otherwise).
  - **`discard({ amendment })`**: `settle` pending → discarded, for an amendment that never took effect.
  - **`preview({ amendment, effect })`** returns the commands `apply` or `revert` would write, `[{ key, command, value }]`, and writes nothing.
- **`entity-amendment-gateway`** takes the entity type as an argument (`propose`, and `settle` with `action` one of `apply`, `revert`, `discard`) and runs the operation of the trait `amendable`, for an HTTP route.
- **`validate()`** checks each amendment type of a use: it is an entity type, its `mapping` yields a body that fits the amendment's schema and reads only fields the entity has, the items of `apply` and `revert` name a trait of the entity and an operation of it, read only `entity`, `amendment` and `effectiveFrom` and give an input that fits the operation, a trait operation isn't run twice in a list, and an `apply` doesn't change a trait its `revert` leaves.

An amendment is a plain entity (an entity type with a `body`): it doesn't know what it amends, and its status is the one in the ledger. Its own process (an approval, a review) is the application's, in its state model; what lets an amendment be applied is who may call `apply` ([authorization](../../services/authorization/README.md)) and the state of the entity. The package leaves to the application the HTTP routes, who may do what, the amendment types and the shape of their data, and how the input of a request becomes an amendment and an amendment a version. The demo's types turn a flat `changes` object into a patch ([amendment endpoint](../../../demo/contracts/amendment-endpoint.eson)).

```json
{ "id": "policy", "kind": "entity-type", "data": { "traits": {
    "body": { "trait": "versioned-body", "configuration": { "schema": { "!startDate": "@date", "!premium": "number" }, "versioned": { "validFrom": "/startDate" } } },
    "state": { "configuration": { "…": "a model with operations: { propose: { status: { active: true } }, apply: { status: { active: true } } }" } },
    "amendable": { "configuration": {
        "premium-raise": { "apply": [{ "key": "body", "operation": "amend", "input": { "validFrom": "#.effectiveFrom", "ref": "#.amendment.businessKey", "body": { "$func/patched-body": { "body": { "$func/record-body": "#.entity" }, "patch": [{ "op": "replace", "path": "/premium", "value": "#.amendment.data.body.premium" }] } } } }] },
        "cancellation": {
            "apply": [{ "key": "body", "operation": "amend", "input": { "validFrom": "#.effectiveFrom", "ref": "#.amendment.businessKey", "body": { "$func/patched-body": { "body": { "$func/record-body": "#.entity" }, "patch": [{ "op": "add", "path": "/endDate", "value": "#.effectiveFrom" }] } } } }, { "key": "state", "operation": "transition", "input": { "transition": "cancel" } }],
            "revert": [{ "key": "body", "operation": "remove", "input": { "validFrom": "#.effectiveFrom", "ref": "#.amendment.businessKey" } }, { "key": "state", "operation": "transition", "input": { "transition": "reactivate" } }]
        }
    } }
} } }
{ "id": "premium-raise", "kind": "entity-type", "data": { "traits": { "body": { "configuration": { "schema": { "!reason": "string", "!premium": "number" } } } } } }
```
