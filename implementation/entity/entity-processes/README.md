# entity-processes

Durable processes outside the core ([design](../../../design/durable-processes.md)): a process is an entity of its own whose lifecycle is a graph of named steps, separate from the business entities it drives. The package is built in parts; this README describes what exists.

## The definition

An element of the kind `process-definition` declares the **roles** (the entities the process reads and changes, `late` ones bound by a step, `many` ones lists), the `input` and `variables` schemas, the `start` step and the `steps`. A step is a `do` pipeline, an optional `set` (a mapping merged into the variables) and **exactly one** exit:

| Exit | Meaning |
|---|---|
| `next: <step>` | continue with that step, in the same transaction |
| `choose: [[test, <step>], …, ["else", <step>]]` | a decision over the process and its participants |
| `wait: { when?, signals?, until? }` | stop; `when` lists conditions `{ test, then }`: a pure mapping over `{ process, entities }` that is tried as the wait begins (a fact already true doesn't wait) and again by every `check` wake-up, on the current data of the participants, the first that holds taking its `then`; `signals` maps a name to `{ to, by, payload? }` (the step it starts and the role that addresses the instance), `until` is `{ at \| after, then }`: a date from a mapping, or an elapsed duration `{ days?, hours?, minutes? }` |
| `end: true` | the process is finished |

A step may also declare `onError: [{ catches: [<code>], set?, then }]`, the way it leaves when its `do` failed; only terminal [error types](../../core/README.md#error-types) can be caught.

`validate()` reports a definition whose start isn't a step, a step with no exit or with several, a step that leads to an unknown step, a step that can't be reached from the start, steps that lead to each other without ever waiting (an endless chain of immediate steps), a choose entry that isn't `[test, step]`, a wait for nothing, an `until` with both `at` and `after` or neither, a signal addressed by a role the process doesn't declare, and an `onError` entry that catches nothing, a code no package registers, or a transient one.

```json
{ "id": "contract-issue-process", "kind": "process-definition", "data": {
    "entities": { "contract": { "entityType": "insurance-contract" }, "review": { "entityType": "review-task", "late": true } },
    "start": "ask",
    "steps": {
        "ask":    { "do": [ /* create the review task */ ], "wait": { "signals": { "answered": { "to": "finish", "by": "contract" } }, "until": { "after": { "days": 10 }, "then": "remind" } } },
        "remind": { "do": [ /* send a reminder */ ], "next": "ask" },
        "finish": { "end": true }
    }
} }
```

## The process entity

A process is an entity of its own. An entity type of the kind `process-entity-type` (`{ definition }`) fixes three traits: `process`, which stores the position `{ definition, step, entities, wait? }` (`entities` maps each bound role to `{ entityType, businessKey }`, a list for a `many` role; `wait` is `{ token, signals, until? }`, with the token the revision of the process entity at which the wait began), `state` with the dimension `status` (`running` → `suspended` | `aborted` | `ended`, `suspended` → `running` | `aborted`; the transitions `suspend`, `resume` and `abort` are the operator's, `end` is the runner's) and `body`, the process variables. The trait `process` has one operation, the private command `move`; creating the entity (`create` with `traits.process = { entities }`) binds the roles and puts the process in the `start` step, and refuses a role that isn't bound, a role the definition lacks, and a late role bound at the start.

## Running steps

`start({ businessKey, entities, input? })` creates the process entity and runs the first steps **in one transaction**: a step reads its participants, runs `do`, merges `set` into the variables, and follows its exit. `next` and `choose` continue with the next step in the same transaction (a chain longer than the setting `maxChain`, 100, is `process-chain-limit`); a `wait` stops and records the wait; `end` makes the transition `end`. The position, the variables and the transition are written as **one change**, with one revision, after the last step; if anything throws, nothing happened, the entity is not even created.

A `do` is a method, so it reads its input at `#.input`: `#.input.process` (the process entity with the variables in its `body`), `#.input.entities` (each role as the record of the participant at its current revision, a list for `many`), `#.input.input` (the start input) and `#.input.signal`. The context key `process` (`{ definition, businessKey, step, token }`) is bound while it runs, managed by the kind. The mappings of a step (`set`, the tests of `choose`, `until.at`) are pure and read the same sources directly (`#.process`, `#.entities`, `#.input`, `#.signal`, `#.output`, the result of `do`).

## Wake-ups and the runner

Everything that moves a process after its start arrives as one message on the channel `process-wakeups` (topic, with the [outbox](../../platform/transactional-outbox/README.md), so a message is committed with whatever put it), consumed by the `message-consumer` `process-runner`, which runs its handler **as the system** (`asSystem`): the process is the system, and security sits at the boundary of the user space, not inside a process. A message names the process entity type and the business key and is one of three kinds:

| Kind | Fields | The runner |
|---|---|---|
| `start` | `entities`, `input?` | `start`, once however often the message is delivered: a start that finds the entity already there is a `duplicate`, and is dropped |
| `signal` | `name`, `payload?` | runs the step the wait names for that signal, with the payload as `#.input.signal`, if the process waits for it |
| `check` | `role?`, `revision?` | evaluates the `when` entries of the wait on the current data and runs the step of the first that holds; nothing if the process doesn't wait or none holds |
| `timer` | `token`, `step` | runs the step of the `until`, if the token is the one of the wait |

A wake-up the process can't use is dropped and acknowledged, never an error: the process isn't `running` (suspended, aborted, ended), it doesn't wait for that signal, or the token isn't the one of its wait (a timer of a wait it left). The token is the revision of the process entity when the wait began, so a message that arrives twice finds the revision moved and is dropped: no table of handled messages, no lock.

A wait with `until` puts its timer in the same transaction that writes the wait: a message with `deliverAt` (the date the wait names, or the time of the wait plus the duration of `after`, read from the `clock` as an effect, so the steps stay deterministic and a test stubs the clock) in the group `<entity type>/<business key>/timer/<token>`, so a timer far in the future never holds back the signals of its process. The wait is stored with the date resolved: `{ token, signals, until: { at, then } }`.

## Noticing a fact

A `when` is woken by a change of what its tests read, never by a message that carries the fact:

- **The publisher** is a `reactions` fill of `entity-type`. In the transaction of the write it computes the **views** of the entity type, derived from the `when` tests of every `process-definition`: one view per definition and role, the paths the tests read as `#.entities.<role>.<path>` (the whole record when a test reads the role bare or the role is `many`). If a view differs between `before` and `after`, it puts `{ entityType, id, businessKey, revision, changed: ["<definition>/<role>", …], via? }` on the channel `entity-view-changes`, committed with the write. Only names cross the broker, never values; a write that changes no view publishes nothing, and `via` is the process whose step made the write.
- **The watcher** (`process-watcher`, as the system) looks up, for each changed view, the processes that hold the entity in that role (`entity-relations-to`, so only running ones), skips the process of `via`, and puts a `check` wake-up for each, in that process's group.
- **The runner** evaluates the tests on the current data (see `check` above); a duplicate or late check finds nothing to do.

Not built: the revision narrowing (`wait.watch`, a check that isn't news is dropped without reading the participants) and the slot `signalViews` for explicit views; every check costs one read of the participants.

## Starting a process and signalling it

The **business key** of a process is derived, not generated: `<definition>/<key of each non-late role, in the order of the definition>` (`contract-review-process/CON-2026-0001`), plus what the optional `key` of the definition (a mapping over `{ entities, input }` giving a list of strings) adds, for a process that may run again for the same participants (`key: ["#.input.year"]` gives `renewal/C-1042/2027`). A `start` without a key derives it, so a second start for the same participants finds the key taken (`duplicate`), which the runner drops as already started: the uniqueness of the key is the only arbiter. `$func/process-business-key` gives the key (a trigger needs it for the ordering group).

A **`process-trigger`** is an adapter outside the definition: a `message-consumer` (a subkind, so it is a consumer of its channel, run as the system) that maps a message to a wake-up. `on` is `{ channel, subject?, test? }` (a `subject` is the broker's filter, `test` a pure mapping over the message that says whether it applies); the effect is exactly one of:

- `start: { process, entities, input? }`: `process` is the process entity type, `entities` a mapping from the message to the bindings of the roles that aren't `late`; it puts a `start` wake-up with the derived key;
- `signal: { process, name, entity, payload? }`: `entity` is a mapping from the message to `{ entityType, businessKey }`, the domain entity the message is about. The trigger finds the running processes that hold it in the role `by` of the signal the definition declares (the relation index) and puts a `signal` wake-up for each; a process that doesn't wait for the signal drops it as stale.

```json
{ "kind": "process-trigger", "data": {
    "on": { "channel": "partner-events", "test": { "$eq": ["#.type", "contract-issued"] } },
    "start": { "process": "contract-review-processes", "entities": { "contract": "#.contractKey" } } } }
```

`validate()` reports a trigger that does neither or both, names a process entity type that doesn't exist, or signals a name the definition doesn't wait for.

## Extending a step

A step marked `extensible: true` is public API: after its `do`, the runner executes the `do` of every fill of the slot `stepExtensions` of the definition whose `step` is that step (ordered by `position`, `after`, `before`), in the same savepoint and the same transaction, so a refusal fails the step like its own. A module adds a check to a step of a definition it doesn't own without touching it: `{ "kind": "slot-fill", "data": { "target": "<definition>", "slot": "stepExtensions", "value": { "step": "issue", "do": … } } }`. The graph (the edges and waits) is not extensible. `validate()` reports a fill at a step that doesn't exist or isn't extensible.

## Finding stuck processes

A process is an entity, so a stuck one is found by data. `$func/process-search-document` maps a record to `{ definition, step, status, waitingUntil (epoch milliseconds, a number the engine can compare), faultCode, failures, entities }`, which an application's `searchIndex` fill of the process entity type uses as its mapping (`{ "set": { "$func/process-search-document": "#.input" } }`), declaring the attributes it filters on in the index settings. "Suspended" or "waiting for a date that has passed" is then a [search query](../../platform/search/README.md). A reindex still loads only the first 200 records ([F38](../../../design/critique.md)).

## Tasks

A `when` entry may list `resolve: { <role>: <outcome> }`: the tasks (roles whose entity type has the [`task` trait](../entity-tasks/README.md)) it closes, with the outcome each gets. The process verifies the fact, then closes the task: when an entry holds, the runner resolves the tasks it lists, and **withdraws what is left**: the tasks named in the `resolve` of the wait that are still open are cancelled when the process leaves the wait by another entry, a signal or the timer. A process that ends or is aborted cancels every task it holds that is still open. All in the transaction of the step, as the system.

`validate()` checks each `resolve`: the role is declared and is a task, the outcome is one the task declares, and every outcome a user may give is routed by some entry of the wait, so an answer can't lead to a dead end.

## Binding, relations and the footprint

A step binds a `late` role by returning `bind` from its `do`: `{ bind: { review: "RT-77" } }`, the business key of the entity it created (a list for a `many` role, which it may only add to). The binding is visible to the steps after it in the same chain and is written with the position. A role bound at the start is never rebound (`conflict`), nor a role bound twice; a role the definition lacks is `invalid`.

Every binding is a **relation** from the process to the participant, the role being the relation type ([entity-relations](../entity-relations/README.md)), kept while the process is `running` or `suspended` and dropped when it has ended or been aborted. A participant can thus not be deleted (`referenced`) while a process holds it, and "which processes hold this contract" is a query (`entity-relations-to`).

The **footprint** is the roles. While a step runs, the context `process` is bound (`{ definition, businessKey, step, token, entities }`), and a guard of every entity type (a fill of `requestGuards`) refuses with `outside-process-footprint` (a `forbidden`, 403) a `create` of a type no role declares, and an update or a delete of an entity that is not a bound participant. Reads are not guarded at run time.

## Failure

A step runs inside a **savepoint**. If its `do` fails with a terminal error that an `onError` entry catches (the code, or a registered ancestor), the work of the step is rolled back whole (its writes, the entities it created, the messages it put), the entry's `set` reads the error as `#.error`, and the process goes on to the entry's `then` in the same transaction. A transient error is never caught: it is retried.

An error nobody caught is handled by a **circuit breaker** when a wake-up fails (a failing `start` just fails, there being no process yet). The setting `breaker.attempts` (3) is on the process entity type kind:

| The error is | The runner |
|---|---|
| an outage (`unavailable`) | nothing is counted, the error goes on and the consumer retries |
| transient | counts consecutive failures of the step in `failures: { step, count }` and lets the error go on, so the broker retries; at the limit it suspends |
| terminal | suspends at once |

**Suspending** records `fault: { step, code, message, attempts, wakeup }` (the wake-up that was being handled) and moves `status` to `suspended`, leaving the position as it was; the wake-up is acknowledged. A step that succeeds forgets `failures`.

## The operator

`suspend`, `resume` and `abort` are transitions of `status` through the existing transition endpoint, granted by the application to a role: `{ "area": "states", "resource": "<process entity type>", "action": ["suspend", "resume", "abort"] }`. A wake-up for a process that isn't `running` is dropped. `resume` replays the wake-up that caused the fault, puts the timer of the wait again (the date may have passed while the process was suspended, and is simply due), and clears `fault` and `failures`; `abort` clears them and replays nothing. A reaction of the trait `process` does it, in the transaction of the transition.

Not built yet: schedules (a delayed start message already does the job; a schedule is data an application adds), the work list and the relations of a task's `about`, the data-flow typing of a `do` (a misspelled path in a step fails at run time, not in `validate()`, [F80](../../../design/critique.md)), and an actor that grants the operator's transitions (the demo declares it).
