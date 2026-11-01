# Writing several traits at once

Closes F53 of the [critique](critique.md).

## Problem

An entity's data is the values of its traits. `create` writes all of them in one revision, but every trait write after that was one `applyChange`, so an operation that changes the body and a timeline together (a contract's data, shown to its user as one document) made two writes, two revisions and a transaction around them, and the guards, reactions and events saw two changes where the user did one.

## Decision

**A write is a set of trait commands applied in one change.** The change carries `commands: [{ key, command, value }]`, the store writes all the keys in one statement, and the revision is raised once.

- **Node.** `traitOperations: [{ key, operation, input }]` runs one trait operation for each item and writes their commands in one change. `traitOperation` is the case of one. Both call the private operation `applyTraitOperations` of `entity-type`, which owns the sequence: read the record once, run each trait operation against the value the record holds now, then `applyChange` with the `entityOperation` of the calling operation, so the model's `operations` by state judge the entity's operation as a whole.
- **Each trait once.** A write names a trait at most once (`invalid` otherwise). The operations then don't depend on each other, nothing has to be folded, and the commands are an unordered set.
- **Not a context.** A builder that makes `traitOperation` defer when it sits in some block would give one node two meanings by where it stands, and the effect of the node (a write) would no longer be readable from the node. The list is declared in one place and the write happens at that node.
- **Guards** run once per change, not once per command, and decide on `before`, `entityOperation` and the `commands`. A guard that cares about one trait finds its command with `$func/change-command`.
- **Reactions** run once per change with `after` and the same `commands`. One revision publishes one event, which lists the commands.
- **Interceptors** see the store write `{ before, values }`. `values` is the map from key to the new value of every command, the derived commands of a trait's `derive` among them ([derived traits](../implementation/entity/entities/README.md#derived-traits)).
- **One revision, one transaction.** The store write is a single statement that applies at `before.revision`, so the change is atomic without anything wrapped around it.

## Changed contracts

| | Before | After |
|---|---|---|
| `entity-change` (operation `trait`) | `key`, `command`, `value` | `commands[]` of `{ key, command, value }` |
| store `update` | `{ before, key, value, derived? }` | `{ before, values }` |
| entity event | `key`, `command` | `commands[]` of `{ key, command }` |

## Not decided here

Which of a version's fields belong to which trait, and what an entity exposes to its users: both stay the entity's declaration. A versioned entity no longer needs the node for its data: its document is one body ([versioned-body](versioned-body.md)). The node stays for the entity that has to change a body and another trait in one revision.
