# entity-validations

The `validation` [trait](../entities/README.md#traits): the business validations of an entity, applied at every change, and the errors they find.

- The value of `data.validation` is a map from an error name to its message (`{ "amount": "must be positive" }`); `{}` is an entity without errors. Nothing here refuses a write: an entity with errors is stored, so a draft can be saved while it is incomplete.
- The validations are the fills of the slot `validations` of `entity-type` (on every entity type, a class or one entity type). A fill is a mapping from `{ entityType, businessKey, data }`, the record as the write leaves it, to the errors it finds (`{}` for none); the errors of all the fills are merged, so a fill names the errors it can find and two fills that name the same error overwrite each other.
- The `derive` of the trait applies the fills to the record as the write leaves it, on `create` and on every trait write, and requests its operation `validate` only when the errors changed, so they land in the same revision ([derived traits](../entities/README.md#derived-traits)). The entity type lists the keys the fills read in `dependsOn`, so the errors are judged again when one of them changes. Callers can't write it: `create` fails with `invalid` when `traits.validation` is given.
- The trait writes nothing but its own key. What the errors cause is the configurator's decision: the configuration `onValidation` is a mapping, the delegate whose operations the `derive` requests, after its own, when the errors changed, from `{ entityType, businessKey, errors }` to the trait operations to run (`[{ key, operation, input }]`, as `traitOperations` takes them). They run in the same derivation, in the queue after `validate`, so their commands land in the revision of the write, and a failure refuses it. Without a delegate the errors are only stored. `validate()` reports a literal request whose key the entity type has no trait for, or whose operation that trait doesn't have; a request that is computed, and the names inside its `input` (a transition, say), are not checked.

```json
{ "id": "invoice", "kind": "entity-type", "data": { "traits": { "validation": { "configuration": {} } } } }
{ "id": "invoice-amount-positive", "kind": "slot-fill", "data": { "target": "invoice", "slot": "validations", "value": { "$if": [{ "$gt": ["#.data.body.amount", 0] }, {}, { "amount": "must be positive" }] } } }
```

## Reacting to the errors

A state dimension that follows the errors is the application's: its model declares the dimension and transitions that move it, and the delegate asks for the operation `transition` of the trait `state` ([entity-states](../entity-states/README.md)), which judges it against the state the write leaves. The trait knows nothing of the `state` trait.

```json
"state": { "configuration": {
    "states": { "status": { "draft": true, "issued": true }, "validity": { "valid": true, "invalid": true } },
    "transitions": {
        "markValid": { "validity": { "valid": "valid", "invalid": "valid" } },
        "markInvalid": { "validity": { "valid": "invalid", "invalid": "invalid" } },
        "issue": { "status": { "draft": "issued" }, "validity": { "valid": true } }
    },
    "initialStates": { "default": { "status": "draft", "validity": "valid" } }
} },
"validation": { "configuration": { "onValidation": [{
    "key": "state",
    "operation": "transition",
    "input": { "transition": { "$if": [{ "$eq": [{ "$count": { "collection": { "$keys": "#.errors" } } }, 0] }, "markValid", "markInvalid"] } }
}] } }
```

A state dimension is one way to model an invalid entity, idiomatic but not the only one. The delegate asks for any operations of any trait, none, or several, and sees the individual errors, so an entity type can flag, move a process state, write a field, or only store the errors, and one error can block while another only warns. What an error means is the entity type's decision, which is why the trait fixes none. Effects outside the entity belong to the `reactions` slot, which sees `data.validation`.
