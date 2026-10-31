# State permissions

Status: **implemented** (R12), demonstrated by the demo's contracts ([demo](../demo/README.md)). Who may modify an entity in a given state: a process permission that depends on the lifecycle of the record. The work is R12 in [refactoring-plan.md](refactoring-plan.md). It extends [authorization](../implementation/services/authorization/README.md) with the states of [entity-states](../implementation/entity/entity-states/README.md), and enforces like [row access](row-access.md).

## 1. The problem

[Authorization](../implementation/services/authorization/README.md) decides at the boundary, from the input of the request. The state of a record is data the boundary doesn't read, and the README leaves data-dependent rules to guards. A guard written per entity type would have no `validate`, no `bpf explain` and no place in the actor and role model, so "who may modify a draft" would be code. State permissions make the state a dimension of the operation, declared in grants, and evaluate it where the record is known.

## 2. The permission state

The permission state of a record is the value of one dimension of its state model, named by `permissionDimension` in the configuration of the `state` trait.

```json
"state": { "configuration": {
    "states": { "status": { "draft": true, "submitted": true, "approved": true }, "payment": { "open": true, "paid": true } },
    "permissionDimension": "status" } }
```

- **Defaults.** The only dimension of a model, otherwise `status`, so a simple entity declares nothing. `validate` reports a permission dimension the model doesn't declare.
- **Separate aspects are separate dimensions** ([entity-states](../implementation/entity/entity-states/README.md)), so what is controlled by state is modelled as a dimension of its own: a control that depends on payment names `payment`. A control that depends on other data of the record is ownership ([row-access](row-access.md)).
- **One value per record.** The permission state is the current state of that dimension, so a record has exactly one.

## 3. The dimension

[state-permissions](../implementation/services/state-permissions/README.md) fills the slot `dimensions` of `default-authorization` with `state`, after `action`. Its values are the union of the states of the permission dimensions of every entity type, registered at load as a closed set, like the schema `entity-transition`. A grant names it as any dimension:

```json
{ "id": "underwriter-actor", "kind": "actor", "data": { "grants": [
    { "area": "entities", "resource": "insurance-contract-type", "action": "query" },
    { "area": "entities", "resource": "insurance-contract-type", "action": "command", "state": "draft" }
] } }
```

- A value, an array of values or `*`; a grant that doesn't name `state` is `*`, so grants written before the dimension existed keep their meaning.
- Permissions still only add. To restrict a role, grant `query` everywhere and `command` in some states; there is no deny ([no deny](../implementation/services/authorization/README.md#design)).
- **Transitions.** `{ "area": "states", "action": "approve" }` already says who may approve, and the model's source states say from where. A `state` on that grant is for finer control (approving only in `locked`).

## 4. Enforcement

### At the boundary

The state of the target is unknown there. `authorize-requests` computes the operation as before and the `state` level of the trie follows every edge: the request passes if the role could do it in some permission state. It binds the operation (without the state) as `_ctx.operation`, a key the wrapper `authorized` manages. The dimension is declared with `values` (a mapping to its closed set), which marks it as decided later: no endpoint names it.

### At the entity

A generic fill on `entity-type`, present on every type with a `state` trait, the **state guard**:

- It takes `_ctx.operation` and sets its `state` to the permission state of the record, then asks `$func/permits({ operation, roles })` with `_ctx.user.roles`; a role that doesn't permit it gives `forbidden`. It is not `not-found`: the state doesn't hide existence, and row access has already decided that.
- **Writes only.** `writeTrait`, `delete` and `transition` check the record as it is (`before`). `create` checks the state it is born in (`after`), by a reaction that rolls the transaction back. Reads and search are not checked: they are the matter of row access, and a control that depends on the state is the state in the ownership.
- **Which records.** Only a record whose entity type the operation's `resource` covers. A transition of a contract that also writes a party is the contract's business operation: the party's state is not asked. Without a principal, for the `system` principal and for an entity type without the `state` trait nothing is checked, as in row access.
- **Read, not stored.** The permission state is the state the record has when a write is checked. Nothing is stored or backfilled. This differs from ownership on purpose: ownership is stored because the search filters it, a permission state is asked only by writes.

## 5. Validation and explanation

`validate()` reports:

- a permission dimension the model doesn't declare;
- a grant whose `state` is declared by no entity type under its `resource`: without this check it would pass the boundary and nothing would check it again;
- a `state` on a grant of `action: query`, which no read ever checks.

`bpf explain` shows, for an entity type, per permission state the roles that permit updating and each transition; for an actor or a role, the permission states in which it may command.

## 6. Open points

- **Side effects.** A process that changes records of another entity type is judged by the permission of its own operation ([§4](#4-enforcement)); a state check of those records is a deliberate non-goal.
- **Search by state.** A control on reads by state goes through the ownership; a `state` dimension on `query` grants is rejected, not ignored.
