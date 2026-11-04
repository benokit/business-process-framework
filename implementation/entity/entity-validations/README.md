# entity-validations

The `validation` [trait](../entities/README.md#traits): the business validations of an entity, applied at every change, and the errors they find.

- The value of `data.validation` is a map from an error name to its message (`{ "amount": "must be positive" }`); `{}` is an entity without errors. Nothing here refuses a write: an entity with errors is stored, so a draft can be saved while it is incomplete.
- The validations are the fills of the slot `validations` of `entity-type` (on every entity type, a class or one entity type). A fill is a mapping from `{ entityType, businessKey, data }`, the record as the write leaves it, to the errors it finds (`{}` for none); the errors of all the fills are merged, so a fill names the errors it can find and two fills that name the same error overwrite each other.
- The `derive` of the trait applies the fills to the record as the write leaves it, on `create` and on every trait write, and gives a command only when the errors changed, so they land in the same revision ([derived traits](../entities/README.md#derived-traits)). Callers can't write it: `create` fails with `invalid` when `traits.validation` is given.
- The trait takes no configuration (`"validation": { "configuration": {} }`) and brings everything else with it.

```json
{ "id": "invoice", "kind": "stateful-body-entity-type", "data": { "traits": { "validation": { "configuration": {} } } } }
{ "id": "invoice-amount-positive", "kind": "slot-fill", "data": { "target": "invoice", "slot": "validations", "value": { "$if": [{ "$gt": ["#.data.body.amount", 0] }, {}, { "amount": "must be positive" }] } } }
```

## The validity dimension

On an entity type that has the [`state`](../entity-states/README.md) trait, the trait [provides](../entities/README.md#provided-traits) the dimension `validity` (`valid`, `invalid`) to the states model, and its `derive` writes it beside `data.validation`, in the same revision ([foreign writes](../entities/README.md#derived-traits)): `invalid` while there are errors, `valid` otherwise. A transition that lists the dimension among its sources is blocked with `conflict` while the entity has errors:

```json
"transitions": { "issue": { "status": { "draft": "issued" }, "validity": { "valid": true } } }
```

- The dimension is the trait's: `validate()` reports a transition that moves it. An entity type without the `state` trait has no dimension and nothing else changes.
- A model with the dimension has two dimensions, so name the process dimension (`processDimension`) unless it is called `status`.
