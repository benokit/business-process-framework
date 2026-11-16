# entity-tasks

The `task` [trait](../entities/README.md#traits): a work item through which a [process](../entity-processes/README.md) asks the user space for something and keeps track of it ([design](../../../design/durable-processes.md#7-tasks-the-protocol-with-the-user-space)). **A task is closed by the process, on a fact, never by a user's word**: the user does the real action on an entity, or gives an answer, and the process verifies it against the data.

An entity type takes the trait with the outcomes the process may close a task of this type with:

```json
{ "id": "review-task", "kind": "entity-type", "data": { "traits": {
    "task": { "configuration": { "actor": "underwriter", "outcomes": {
        "approved": { "answer": true },
        "rejected": { "answer": { "!reason": "string" } },
        "timed-out": true } } },
    "body": { "configuration": { "schema": { "contractNote": "string" } } } } } }
```

An outcome with `answer` (`true` or the schema of the result) is one a **user may give**; one without it is reachable only by a condition of the process.

`data.task` is `{ status, actor?, origin?, about?, dueOn?, assignedTo?, answer?, outcome? }`: `status` is `open`, then `resolved` or `cancelled`, both terminal. A task is created with `traits.task = { origin?, about?, actor?, dueOn? }` (the actor defaults to the configured one), `origin` being `{ process, step }`, `about` the entities it concerns and `dueOn` a date the step gives (a task never expires by itself).

| Operation | Who | Does |
|---|---|---|
| `answer({ outcome, result? })` | a user | records what the user said and who (`answer: { outcome, result?, by }`) for an outcome that has `answer`, with a result that matches its schema, while the task is open; closes nothing, a later answer replaces it |
| `claim` | a user | sets `assignedTo` to the caller, for work lists |
| `resolve({ outcome })` | the system | closes the task with an outcome the type declares |
| `cancel` | the system | withdraws the task |

`resolve` and `cancel` are refused with `private-operation` (403) for any principal without the role `system`: a guard of the trait. The runner of a process acts as the system, so only it closes a task. An operation on a closed task is a `conflict`: the revision decides the race between an answer and a withdrawal.

While a task is open, each entity it is `about` is held by an [entity relation](../entity-relations/README.md) of the type `about` (a fill of `relations` on every entity type, none for a closed task): "the tasks about this contract" is `entity-relations-to({ targetEntityId, relationType: "about" })`, and the entity can't be deleted (`referenced`) while a task about it is open. The package therefore needs `entity-relations`.

## Work list

Every task has the same shape, so one list shows the tasks of an actor across task types. `$func/task-search-document` maps a task record to `{ entityType, status, actor, assignedTo, dueOn (epoch milliseconds), outcome, about ("<entity type>/<business key>" each) }`; an application fills the `searchIndex` of each task type with one shared index and that mapping (`{ "set": { "$func/task-search-document": "#.input" } }`), declares the attributes it filters on, and a [search query](../../platform/search/README.md) such as `status = open AND actor = …` is the list. A closed task leaves the list when it is reindexed by its event.

The schema `task-outcome-name` is the names of every outcome a user may give, registered at load, so the authorization can grant outcomes one by one ([entity-tasks-http](../../adapters/entity-tasks-http/README.md)). The process side, the `resolve` of a `when` entry and the withdrawal of tasks, is in [entity-processes](../entity-processes/README.md#tasks).
