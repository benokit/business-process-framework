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
