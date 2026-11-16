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
| `check` | | evaluates the `when` entries of the wait on the current data and runs the step of the first that holds; nothing if the process doesn't wait or none holds |
| `timer` | `token`, `step` | runs the step of the `until`, if the token is the one of the wait |

A wake-up the process can't use is dropped and acknowledged, never an error: the process isn't `running` (suspended, aborted, ended), it doesn't wait for that signal, or the token isn't the one of its wait (a timer of a wait it left). The token is the revision of the process entity when the wait began, so a message that arrives twice finds the revision moved and is dropped: no table of handled messages, no lock.

A wait with `until` puts its timer in the same transaction that writes the wait: a message with `deliverAt` (the date the wait names, or the time of the wait plus the duration of `after`, read from the `clock` as an effect, so the steps stay deterministic and a test stubs the clock) in the group `<entity type>/<business key>/timer/<token>`, so a timer far in the future never holds back the signals of its process. The wait is stored with the date resolved: `{ token, signals, until: { at, then } }`.

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

Not built yet: tasks and `when` (R5.3b), the demo (R5.3c), the triggers that put `start` and `signal` and the derived business key (R5.3d), the data-flow typing of a `do` (a misspelled path in a step fails at run time, not in `validate()`), and an actor that grants the operator's transitions (the demo declares it).
