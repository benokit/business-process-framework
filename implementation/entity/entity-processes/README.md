# entity-processes

Durable processes outside the core ([design](../../../design/durable-processes.md)): a process is an entity of its own whose lifecycle is a graph of named steps, separate from the business entities it drives. The package is built in parts; this README describes what exists.

## The definition

An element of the kind `process-definition` declares the **roles** (the entities the process reads and changes, `late` ones bound by a step, `many` ones lists), the `input` and `variables` schemas, the `start` step and the `steps`. A step is a `do` pipeline, an optional `set` (a mapping merged into the variables) and **exactly one** exit:

| Exit | Meaning |
|---|---|
| `next: <step>` | continue with that step, in the same transaction |
| `choose: [[test, <step>], …, ["else", <step>]]` | a decision over the process and its participants |
| `wait: { signals?, until? }` | stop; `signals` maps a name to `{ to, by, payload? }` (the step it starts and the role that addresses the instance), `until` is `{ at \| after, then }`: a date from a mapping, or an elapsed duration `{ days?, hours?, minutes? }` |
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
| `timer` | `token`, `step` | runs the step of the `until`, if the token is the one of the wait |

A wake-up the process can't use is dropped and acknowledged, never an error: the process isn't `running` (suspended, aborted, ended), it doesn't wait for that signal, or the token isn't the one of its wait (a timer of a wait it left). The token is the revision of the process entity when the wait began, so a message that arrives twice finds the revision moved and is dropped: no table of handled messages, no lock.

A wait with `until` puts its timer in the same transaction that writes the wait: a message with `deliverAt` (the date the wait names, or the time of the wait plus the duration of `after`, read from the `clock` as an effect, so the steps stay deterministic and a test stubs the clock) in the group `<entity type>/<business key>/timer/<token>`, so a timer far in the future never holds back the signals of its process. The wait is stored with the date resolved: `{ token, signals, until: { at, then } }`.

Not built yet: `onError` and the breaker, the operator's lifecycle, the footprint guard, tasks and `when`, the triggers that put `start` and `signal`.
