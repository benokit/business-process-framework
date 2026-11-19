# Durable processes

Status: **built** (R5.3a–d and R5.4, with the deviations of §13.2). Scope: [R5.3](refactoring-plan.md) and [R5.4](refactoring-plan.md); the open question was [Q3](critique.md), the constraints are P14, P13, P18, P23 and G5–G10. The packages are [entity-processes](../implementation/entity/entity-processes/README.md) and [entity-tasks](../implementation/entity/entity-tasks/README.md); this document keeps the reasoning, the READMEs own the facts. Points that needed a decision are marked **Decision** and collected at the end.

## 1. The problem

A business process is a long-lived sequence of steps with waits between them: a contract is issued, a review is requested, nobody answers for ten days, a reminder goes out, the review arrives, the contract is activated. The waits last days; the process must survive restarts, deployments and crashes; every step must happen once as far as the data is concerned.

P14 fixes the approach: **the core has no durable execution**. A pipeline runs to its end inside one request or one message. A wait is the end of one pipeline and the start of another, so what lives across a wait is data, and what wakes it is a message. The framework has to offer the *means*, and a process kind is built from them outside the core.

What exists already:

| Need | Provided by |
|---|---|
| State that survives a wait, with optimistic concurrency | entities: `revision`, the `state` trait, `conflict` on a stale revision |
| Atomic "change the state and send a message" | the transactional outbox (`put` in the business transaction) |
| Stable identity of a message, ordering by group | `messageId`, `group` of the envelope, delivery in order within a group |
| Consumers that handle a message once per commit | `message-consumer`, at-least-once with idempotent handlers |
| An effect that is not repeated on redelivery | none; to be defined here (§4) |

What is missing, as Q3 says: a timer, and a way to address a message to one process instance. §5 argues that the second is a convention and the first is the only messaging capability to add.

## 2. The model

A process is **an entity of its own whose lifecycle is a graph of named steps**, separate from the business entities it drives (its **participants**). A contract does not carry its issue process, and a process may involve several entities: separation of concerns, and a process comes and goes while a contract stays. Two parts, following the pattern of `state-machine` and the `state` trait:

- **`process-definition`** (element kind): the participants (roles), the steps and the graph between them. Declarative data, one owner of the facts a diagram, a validator and an agent need (F12: orchestration as data).
- **`process` trait** (kind extending `valued-entity-trait`): configured by a definition (`{ "/ref": "<id>" }`, as an entity type takes a `state-machine`), it stores the instance's position and its bound participants under `data.process` and offers the private operations that move it (§2.3). A **process entity type** is an entity type with this trait (its `body`, the existing trait, holds the process variables, §2.4); nothing collides with the participants' types (P17).

A process instance is therefore an ordinary entity: it is created, read, searched, authorized, audited and sent as `entity-events` like any other, and `bpf explain` shows its definition.

### 2.0 Participants

The definition declares the **roles** of the process: the entities it reads and changes.

```json
"entities": {
  "contract":     { "entityType": "insurance-contract" },
  "policyholder": { "entityType": "party" },
  "review":       { "entityType": "review-task", "late": true },
  "documents":    { "entityType": "document-task", "late": true },
  "claims":       { "entityType": "claim", "many": true }
}
```

- A role has an entity type, and may be a list (`many: true`, for example every contract of a portfolio in a renewal).
- A role is **bound** to an entity, by `{ entityType, businessKey }` (a list for `many`). A role not marked `late` is bound by the input of `start` and the process doesn't start without it. A **`late`** role is bound by a step, when the process generates the entity (a review task, a document, a payment order): the step creates the entity and binds it in the same transaction, `bind: { review: "<the created entity>" }`, or a list for `many` (it may only add to it). A role is **never rebound**: a participant doesn't silently change. Binding a bound role, or a late role to an entity of another type, is `conflict`.
- Every binding is **recorded as an entity relation** ([entity-relations](../implementation/entity/entity-relations/README.md)) from the process to the participant, so "which processes involve this contract" is a query, and a participant can't be deleted while a process holds it (the rule of F76).
- **The footprint is the roles.** A step reads and writes entities through its roles; a write to an entity that is not a bound participant (or to a type no role declares) is refused. The process is then analyzable: `validate()` reports a `do` that names a role the definition lacks, uses a `late` role before a step that binds it can have run, or writes to a type no role declares; `bpf explain` lists what a process can touch. Entities a step creates are participants too: it binds them (`late`) or, if nothing needs them afterwards, creates them as the result of the step's change and they are not participants.

### 2.1 The definition

```json
{ "id": "contract-issue-process", "kind": "process-definition", "data": {
    "entities": {
      "contract":  { "entityType": "insurance-contract" },
      "documents": { "entityType": "document-task", "late": true },
      "review":    { "entityType": "review-task", "late": true }
    },
    "input": { "!requestedBy": "string" },
    "variables": { "reminders": "integer", "approvedBy": "string" },
    "start": "collect-documents",
    "steps": {
      "collect-documents": {
        "do": [ /* create the document task, bind it as "documents" */ ],
        "wait": { "when": [ { "test": { "$eq": ["#.entities.contract.data.body.documentAttached", true] },
                              "resolve": { "documents": "attached" }, "then": "request-review" } ] }
      },
      "request-review": {
        "do": [ /* create the review task, bind it as "review" */ ],
        "wait": {
          "when": [ { "test": { "$eq": ["#.entities.review.data.task.answer.outcome", "approved"] },
                      "resolve": { "review": "approved" }, "then": "activate" },
                    { "test": { "$eq": ["#.entities.review.data.task.answer.outcome", "rejected"] },
                      "resolve": { "review": "rejected" }, "then": "close" } ],
          "until": { "at": "#.entities.contract.data.body.reviewDueOn", "then": "remind" }
        }
      },
      "remind":   { "do": [ /* send a reminder about #.entities.review */ ],
                    "set": { "reminders": { "$sum": ["#.process.data.body.reminders", 1] } }, "next": "request-review" },
      "activate": { "do": [ /* transition #.entities.contract to active */ ],
                    "set": { "approvedBy": "#.entities.review.data.task.answer.by" }, "end": true },
      "close":    { "do": [ /* transition #.entities.contract to cancelled */ ], "end": true }
    }
} }
```

A step is a pipeline `do`, an optional `set` (§2.4) and **exactly one** of:

| Exit | Meaning |
|---|---|
| `next: <step>` | continue with that step, in the same transaction (a sequence of short steps is one unit) |
| `choose: [{ test, then: <step> }, …, { else: <step> }]` | `$cond` on the process, its participants and the step's output: a decision, still declared |
| `wait: { when?, signals?, until? }` | stop. `when` lists conditions `{ test, resolve?, then }`; `signals` maps a signal name to `{ to, by, payload? }`: the step it starts, the role that addresses the instance and the payload schema (§2.4, §6.1); `until` gives `at` (a date) or `after` (a duration) and the step to start when it passes (§5.2) |
| `end: true` | the process is finished |

A step may also declare **`onError: [{ catches: [<code>…], set?, then: <step> }, …]`**, the exit of a step whose `do` failed. It is not a second exit beside the five above but the way the same step leaves when its work refused: the entries are tried in order, the first whose `catches` names the error's code (or a registered ancestor of it, §10.1) wins, and the process goes to its `then`, a step of the graph like any other, so the diagram and `validate()` see the failure edge. `do` stays **atomic**: the work of the step, its writes, the entities it created and the messages it put, is rolled back as a whole before the entry is taken (a savepoint, §10.2), so a step never half-happens. The entry's `set` is the one place the error is read: it sees `#.error` (`{ code, message, data }`) beside the usual sources and merges what it chooses into the variables, so the next step reads it from there. Only *terminal* errors can be caught (§10.1): a transient one propagates, to be retried, whatever the entry says, and `validate()` reports an entry that names a transient code.

```json
"request-review": { "do": [ /* create the review task */ ], "wait": { … },
                    "onError": [ { "catches": ["state-refused"], "set": { "refusal": "#.error.message" }, "then": "report-refusal" } ] }
```

`when` is a wait on a **fact**: `test` is a pure mapping over `{ process, entities }` (the same sources as `choose`, nothing transient), `resolve` lists the tasks to close with the outcome each gets (§7), `then` is the step. The entries are tried in order, the first that holds wins, and they are tried when the wait begins (so a fact already true doesn't wait) and again after every change of a participant the tests read (§4). The roles a test reads are inferred from its paths, the way the data flow already finds them: nothing is subscribed by hand. A `signal` is for a message that is not a fact about an entity (a partner's message); a fact about an entity is a `when`.

The graph is complete in the data: every step, every edge, every wait. So `validate()` can report an unreachable step, a step with no exit, a `next` to an unknown step, a `signal` no one can send, a loop with no wait in it (an endless chain of immediate steps), and a `do` that reads a path the record doesn't have (the data flow of the existing analysis). A diagram is generated, not drawn (G8, G10).

`do` is a plain pipeline: any node, with the effects the existing rules allow. It is a method, so it reads its input at `#.input`: `#.input.process` (the process entity at the revision the step runs on, with the variables in its `body`), `#.input.input`, `#.input.entities` (each bound role as the record of the participant at its current revision, read in the step's transaction; a list for `many`; an unbound `late` role is absent), `#.input.signal` (the payload of the signal that woke it, if any) and the context key `process` (§3); the pure mappings of a step (`set`, `choose`, `at`) read the same sources directly, as `#.process`, `#.entities`. The data flow types `#.entities.<role>` by the role's entity type, so a misspelled path in a step is `unknown-path`. It does not choose its successor except through `choose`; "where next" is data, "what to do" is code.

### 2.2 What the trait stores

```json
"process": { "definition": "contract-issue-process", "step": "request-review",
             "entities": { "contract": { "entityType": "insurance-contract", "businessKey": "C-1042" },
                           "review":   { "entityType": "review-task", "businessKey": "RT-77" } },
             "wait": { "token": 7, "watch": { "review": 3 }, "until": "2026-12-01" },
             "failures": { "step": "request-review", "count": 1 } }
```

- `step` is where the process is: the step it waits in, or the last one it ran when it has ended. `entities` holds the bound participants. `wait` exists only while waiting; `watch` maps each role its `when` tests read to the revision of the participant when the wait began (§4). `token` is the revision of the process entity at which the wait began; it is what makes a wake-up checkable (§4). `failures` counts consecutive failures of one step for the circuit breaker, and `fault` (absent in the example) records the failure that suspended the process and the wake-up that was being handled (§10.2); both are the runner's. Only the runner writes a process entity, so an unrelated write to a participant never invalidates a wait.
- The value is written by the trait's operations in the same transaction as the step's own effects on the participants: position, bindings and business data move together, all or nothing, since every entity is in one database.

### 2.3 Operations

The operations of the trait are **private** (see [public and private operations](../implementation/entity/entities/README.md#public-and-private-operations)): the process has no public API and no HTTP route (P16 holds trivially). Nothing outside pushes a process. A user acts on an *entity* (§6.0), and the process reacts.

- `start({ entities, input? })`: a plan (a process of the trait: it reads, runs the first steps, creates entities, commits) that binds the declared roles from `entities` (all that aren't `late`), records the relations and puts the process in `start`. The business key is derived (§6.2).
- `signal({ businessKey, name, payload? })`: checks that the process waits for `name`, runs the step the signal names, and moves on.
- `check({ businessKey })`: evaluates the `when` entries of the wait on the current data; the first that holds closes its tasks and runs its step; none does nothing.
- the wake-up of a timer: the same runner, started by the timer's message.

All of them are reached by one internal message, `process-wakeup` of the kinds `start`, `signal`, `check` and `timer` (§5.1), put by triggers (§6.1), by the watcher of participants (§4), by steps and by the timer (§5.2), and consumed by the runner. A deployment that wants an API to start a process exposes it as an operation of its own that creates an entity a trigger starts from, never the trait's operation.

#### Lifecycle: what an operator can do

The position of a process is the `step` of its own value, not a dimension of the `state` trait: the graph is already in the definition, the transitions would be named per edge and fill the closed set of transition names that authorization grants with names nobody can be granted, and the position would be split from `wait` and `entities` across two traits. What an operator needs is another thing, a **lifecycle**, and that is exactly what the [`state` trait](../implementation/entity/entity-states/README.md) is for. So a process entity type has both traits:

- the trait `process`: the position (`step`, `entities`, `wait`), moved by the runner only;
- the trait `state`, one dimension `status`: `running` (initial) → `suspended` \| `aborted` \| `ended`, `suspended` → `running` \| `aborted`, `aborted` and `ended` terminal (the graph is fixed by the kind that introduces the dimension, as the state trait describes). The transitions `suspend`, `resume` and `abort` are the operator's, through the existing transition endpoints and their authorization: the process package ships an actor `process-operator-actor` that grants them (P20), and an application assigns it to a role. The transition `end` is **the runner's**: it makes it, as the system, when the definition reaches an `end` (§3); no actor is granted it.

What the runner does with it:

- a wake-up for a process that isn't `running` runs no step. A process `suspended` is not listening: its wake-ups are acknowledged and dropped, and `resume` makes up for what can be made up: it puts a `check` (the `when` tests are evaluated on the current data) and puts the timer of the wait again with its `until` as `deliverAt`, so a date that has passed is simply due (the framework asks for no "now", P23). A signal that arrives while suspended is dropped (logged with its correlation, nothing stored): the process is not listening, and no other signal is processed before the transition that is pending has been made. The one exception is the wake-up that *caused* the fault (§10.2), which is kept and replayed by `resume` (**decision 13**);
- `abort` ends the process where it is: the trait `process` reacts to the move of `status` to `aborted` ([hooks of a trait](../implementation/entity/entities/README.md#hooks-of-a-trait)) and cancels the tasks still open, in the same transaction; the relations of a process that is no longer running or suspended are dropped (§6.4), and the participants stay as the steps left them: a compensation is a process of its own, written by hand;
- a **stuck** process (§10) is handled by the same transitions: `suspend` stops it, a corrected definition or data and `resume` re-evaluates it.

### 2.4 Data flow

There is no execution log (P14), so what a later step needs after a wait must be stored: nothing is carried in memory from one pipeline to the next. A step therefore sees four sources, each with one job:

| Source | Holds | Lives |
|---|---|---|
| `#.entities.<role>` | the business facts (the contract, the policyholder) | durably, in the participants |
| `#.process.data.body` (the **variables**) | data that belongs to the process and to no participant: a rejection reason, a retry count, a chosen route, a computed deadline | durably, in the process entity |
| `#.input` (of `start`) and `#.signal` (of the waking message) | what the starting trigger or step said | transiently: only the step it starts or wakes sees it |
| `#.output` | what the step's `do` returned | the transaction: `choose`, `set` and `until` see it, then it is gone |

Everything is **not** resolvable from the participants, and it shouldn't be: process-only data would have to become entities of their own or be forced into a participant that doesn't own it, and a signal's payload needs somewhere to land. The variables are the `body` trait of the process entity, the existing one, with a shape the definition declares (`variables`), so versions, views, search and events apply and the data flow analysis types them.

**How data controls the execution.** The `do` block reads the four sources and performs effects; it never names the next step (P3: effects in nodes, data flow in mappings). Control goes through the declared exits only: the tests of `choose` and `when` and the date of `until.at` are pure mappings over `{ process, entities, input, signal, output }`. What must outlive the step is written by a declared **`set`** beside the exit: a pure mapping over the same, giving a patch of the variables (merged by the data algebra), applied by the runner in the same change as the step's other writes. The data flow of a step is thus visible in the definition: reads in `do`, tests in `choose`, writes in `set`. A value that belongs to a participant is written to it by `do`, through the participant's operations, as any write.

**Typed.** The definition declares `input` (the schema of the `start` input), `variables` (the shape of the body) and, for a signal that carries a payload, its schema (a signal is mostly a name: the step reads the facts from the participants); a trigger's `signal` is checked against it:

```json
"input":     { "!requestedBy": "string" },
"variables": { "reminders": "integer", "approvedBy": "string" },
...
"wait": { "when": [ { "test": <a condition over participants>, "then": "approve" } ],
          "signals": { "partner-reply": { "to": "check", "by": "contract", "payload": { "!count": "integer" } } } }
```

`#.signal` in a step is typed by the entries to it: a step reached only by `partner-reply` sees `count`; a `when` has no payload, the step reads the facts from the participants, and a user's answer is in `#.entities.<role>.data.task.answer`, typed by the outcome's schema in the task type (§7.1); a step reached by several entries sees the union of their types. **Checked** with `mappingType` of the [data flow](../implementation/core/README.md#data-flow): a path that all the entries provide has its type, a path some provide is typed `<type> | null` (no problem for a comparison or a string, the warning `possibly-missing-operand` for arithmetic), and a path none provides is `unknown-path`, an error. The process package types the scope `{ process, entities, input, signal, output }` itself, as [entity-ownership](../implementation/entity/entity-ownership/README.md) types its rule from the entity type: `mappingType(code, scopeType)` is exported for this. `#.entities.<role>.data.body` is then typed by the body schema of the role's entity type; **every other trait is typed as any today** (`data.state`, `data.task` are not checked). That is accepted for the first version: the structure of every trait's value could be declared as the `output` of its `initialize` and operations (§13.1, 3), but a process doesn't need it, and a precise shape derived from the configuration (state names, dimensions) has no consumer. A `set` is checked against `variables`, a `choose` test against what its sources have. A step that needs a value later `set`s it, and that is checked in one place.

### 2.5 Processes and state machines

A process and the [state machine](../implementation/entity/entity-states/README.md) of an entity both have named positions and moves, but they answer different questions:

| | State machine (the `state` trait) | Process |
|---|---|---|
| Subject | one entity | several entities (the roles), people, time |
| Says | what is **possible**: which moves are legal, their guards, who may make each (per-transition authorization) | what is **expected and when**: the waits, the deadlines, the tasks, the order of work |
| Enforced | always, by every writer, with or without a process | only by the runner, for the processes that run |

A step is not a state: `request-review` and `remind` leave the contract in the same state, and a step also touches the review task and other participants. Tying the steps to one entity's states would undo the participants of §2.0.

- **Use a state machine alone** when the whole thing is the lifecycle of one entity driven by users (a document: draft, review, published; the demo's approvals). A process earns its place when there are waits, deadlines, several entities or work delegated through tasks.
- **A process never bypasses the machine.** A step changes the state of a participant only through its `transition`, with its guards and its state model (the footprint rule, §2.0); a refused move fails the step like any write. The process **stores no copy** of a participant's state, which would be a second truth: it reads it.
- **A process waits on a state as on any fact.** `when` reads the state of a participant (`$func/record-state` of [entity-states](../implementation/entity/entity-states/README.md#reading-the-state-of-a-record), `$func/state-moved`). The user makes the transition, with the permission the state machine already gives, and the process notices it (§4). When the process wants to ask, assign and track the move, a **task** `about` the entity carries the request (§7), its condition is the state: "issue the contract" is a task whose `when` is that the contract is `issued`, and the action it asks for is the transition itself. The process doesn't make a move that is the user's to make, and the task doesn't grant a permission the state machine doesn't.
- **Checks from both sides** (done by the process package against the models of the roles' entity types, not by the data flow, which types `data.state` as any): `validate()` can report a `when` that waits for a state the entity's model can't reach, and a `do` that requests a transition the model doesn't have, so the expectations of a process are checked against the lifecycle they depend on.
- **Not added:** a sugar form that declares "a task to move entity E to state S and wait for it" (`await: { role, state, task }`). The forms above express it; it is added if the case is written often (a counted cost, [critique](critique.md)), not before.

## 3. Running a step

The driver of a process is a **message consumer**: the runner is a [`message-consumer`](../implementation/platform/messaging/README.md) of the internal channel `process-wakeups` whose handler runs the private operation `step` of the trait. It has no machinery of its own: delivery, retry and ordering are the broker's and the outbox's, and between messages it keeps nothing (P14), the whole durable state of a process being one entity. Per message it runs a step as **one transaction**:

0. Consume a `process-wakeup`. The message names the process: the converter or the watcher that put it resolved the instance (§6.1), so the runner only loads it by `businessKey`. The messages of one process arrive in order, one at a time (its id is the `group`).
1. Read the process entity and its bound participants. A process whose `status` isn't `running` runs no step (§2.3: a suspended one drops the wake-up, an aborted one has nothing left to do). Check the message against the stored position (§4): a timer must match `step` and `wait.token`; a signal must be one the wait lists; a `check` evaluates the `when` tests on the current data; a `start` creates the process (a duplicate fails on the derived key, §6.2). A stale or unmatched message is acknowledged and dropped, nothing is written.
2. Bind the context key `process` = `{ id, businessKey, step, token }` (managed by the process trait's kind, P13) and run `do`. Its writes to participants go through the ordinary entity operations (guards, state models, revision checks), limited to the footprint (§2.0); a `late` binding is recorded with its relation.
3. Evaluate `set` over the step's sources and merge it into the variables; follow the exit: `next`/`choose` loop back to 2 with the new step; `wait` tries its `when` entries on the data as the step leaves it (the first that holds closes its tasks and goes to its `then`, as a `choose` would) and otherwise writes the new `wait` with the roles it reads (`watch`) and, for `until`, puts the delayed message (§5); `end` writes the end and makes the transition `end` of `status`. Leaving a wait cancels the tasks it left open (§7.3).
4. Write the process entity once: the new value of `process`, as one change with one revision, guards and reactions; the participants' changes are written in the same transaction. Messages go to the outbox in the same transaction.

Then commit. If anything throws, the transaction rolls back; nothing has happened, and the message that woke the step is delivered again by the broker's retry, and the token and the revision make the redelivery harmless. A participant changed by someone else between the read and the write fails its revision check (`conflict`): the same rollback and retry, so a step always acts on what it read. **A step is atomic, and a wake-up is the cause of one transition.** The wake-up that is being handled takes the process from the state it waits in to the next one, and everything in between is one unit: the `do` of every step of the chain, the entities they create (the tasks of a step among them, §7.3) and the new position are committed together or not at all. A task of a step therefore exists only when the process has actually *reached* that step; a step reached by a chain of `next` and rolled back leaves nothing behind. Until the next state is reached, the process takes no other message: the messages of one process are handled one at a time in order (the group), and once the transition is committed a message that belonged to the state that was left finds the token moved and is dropped (§4).

A chain of `next` steps is bounded by a limit (an application setting of the kind, an error that carries the steps run, as for the derivation of traits).

### 3.0 The authority of a step: the process is the system

The runner runs every step as the **system** principal (`asSystem` of [security](../implementation/platform/security/README.md): `{ userId: "system", roles: ["system"] }`); there is no principal of a process and no other internal user. The process is an agent that acts on behalf of users with a set of rights of its own, as an administrator who restores an account after a user reports a forgotten password: having the permission to ask is not having the permission to restore, although the request set the process going. So:

- **Security lives at the boundary of the user space** (P19). What a user may *trigger*, an entity operation, an `answer`, a message on a channel, is authorized there, as any operation; what the process then does is not authorized again for that user, since it is not theirs. A permission to trigger a process that may end in a cancellation is not the permission to cancel directly.
- **A process has all rights, and its limits are not a principal's.** They are the footprint (§2.0: a step writes only to the participants it is bound to, which a guard on entity writes enforces while the context `process` is bound), the guards, the state model and the revision checks of the entity operations, which apply to any caller, and the declared effects (an `irreversible` effect of a `do` shows in `bpf explain`). Authorization, [state-permissions](../implementation/services/state-permissions/README.md) and [row access](../implementation/entity/entity-row-access/README.md) skip the `system` principal, so they don't judge a step.
- **What it means for who writes a trigger or an operation.** Whoever makes an operation start or signal a process (an `answer` the actor may give, a state transition, a channel a partner posts to) must grant it with the process's consequences in mind, and a channel a trigger reads must be authenticated by the boundary that feeds it; the process trusts what it is handed.
- **The principal never propagates.** A step never acts as the user who caused the wake-up (that user may be days away, and a timer has none). A step that needs the user's identity reads it from entities, such as the `by` of a task's `answer`.

### 3.1 Effects that are not in the transaction

A step that calls something outside the database (an HTTP service, a mail gateway) can run twice: the transaction that records it can roll back after the call. The framework's answer is the same as for messages, no exactly-once, but a **stable key**: the context `process` gives `{ id, step, token }`, and `$func/process-key` turns it into the string an integration passes as its idempotency key. Two attempts of one step have one key. A step that cannot be made idempotent is split: a step that requests and waits `when` the answer is there, the answer being recorded by the integration as a change of an entity (a payment order's state, say). The framework recommends the second form for anything that takes time.

## 4. Idempotency: a wake-up checks itself

Delivery is at least once, so a wake-up may arrive twice, late, or after the process moved on (a signal arrived first and the timer fires afterwards). The check is by **token**:

- The message that wakes a step carries `{ kind: timer, businessKey, step, token }` (a timer) or `{ kind: signal, businessKey, name, payload? }` (a signal).
- The runner runs it only if the entity's `process.step` and `wait.token` are the ones named, and the wait lists that signal or that timer. Anything else is dropped as stale and acknowledged.
- Running a step changes the revision, so the same message delivered again finds the token moved and is dropped. No table of handled message ids, no lock: the revision is the arbiter, as it already is for every write (`conflict`).
- A signal doesn't carry the token: a trigger looks the process up by its participant (§6.1) and doesn't know in which wait it is, so a signal is accepted while the process waits for its name. The check of a timer is stricter because the timer was set for one wait.

- **A fact is checked, not delivered.** A `when` wait isn't woken by a message that carries the fact: it is woken by a **change of what its tests read**, and then *looks*. Three parts, each in its place:
  - **The publisher of changes** (a `reactions` fill of `entity-type` by the process package, so it runs in the transaction of the write and sees the viewed `before` and `after`) computes the **views** registered for the entity type: a view is a pure mapping from a record to the small value a process reads (for a `when`, the paths its tests read from that role: `{ "task.answer.outcome": … }`). It computes each view on `before` and on `after`, and if they differ it puts `entity-change` in the outbox, committed with the write: `{ entityType, businessKey, revision, changed: [<view name>…], via? }` (the names only, never the values, so nothing but a name crosses the broker; `via` is read from the context `process`, §14, 11). A write that changes no view publishes nothing. The slot `signalViews` of `entity-type`, declared by the process package, takes explicit views (a trigger's or an extension's); the views of the definitions are **derived**, by a pure function over the instances of `process-definition` (`$func/instances-of`), memoized per entity type, so the paths are written once, in the `when`. A path the scan can't see (§13.1, 6) makes the view the whole record: every write is a change. A view must be total, since a failure in it would fail the user's write: `validate()` types it against the record.
  - **The watcher** (a consumer of `entity-view-changes`, subject the entity type) turns each changed view, named `<definition>/<role>`, into a lookup of the running processes of that definition that hold the entity in that role (the relation index, §6.4) and puts a `check` for each: `{ role, revision, via? }`. The lookup is **not** in the reaction: a read per write of a watched type and one more way for a user's write to fail don't belong in the user's transaction.
  - **The runner** reads the process, which it needs anyway, and drops the check without reading any participant unless the change is news: `revision` > `wait.watch[role]` (the revision of the participant when the wait began; a map by business key for a `many` role), and `via.process` isn't itself (a step's own writes happen before its wait is evaluated, so the event is already accounted for). Otherwise it evaluates the tests on the current data: if one holds, the step runs, otherwise nothing happens.
  - A `check` carries no token, since evaluating is idempotent: a duplicate, a late one or one for a process that moved on finds nothing to do. What is not removed: a relevant change by someone else costs a read of the participants (that is the evaluation), and a participant shared by many processes fans out to all of them, which the author avoids by reading a shared entity in `do` and not waiting on it.

A timer cancelled by a signal needs no cancellation: when it fires, it is stale. (An optional `cancel` is §5.)

## 5. The two messaging parts of Q3

### 5.1 Routing to the instance: a convention, not a capability

Q3 lists "a publisher-chosen correlation key" as missing. Looking at what the broker contract gives, nothing is missing in the broker:

- The contract filters by one `subject`, exact match, so a broker could never route to a million instances; per-instance filters would break the rule that the contract is what every broker can do.
- The consumer can route in code: one consumer of one internal channel, `process-wakeups`, receives every start, signal, check and timer; its handler loads the entity by `businessKey` from the payload and runs §3. The payload is open (P18); the key is in it.
- Ordering of one instance's messages is already given by the `group`: the process uses its own id as `group`, so the outbox delivers an instance's messages in order, one at a time, and instances don't wait for each other (the default of `eventGroup` does the same for entity events).
- `subject` can carry the process definition id, so a consumer of one family of processes may filter.

So R5.4 does not add routing to messaging. The `process` kind owns the channel and the payload shape (`process-wakeup`: `{ kind: start | signal | check | timer, businessKey, entityType, step?, name?, payload?, input?, entities?, token? }`; the channel is internal: only triggers, steps and the timer put messages on it); the envelope's `correlation` stays what it is, the tracing id of the request that caused the message.

### 5.2 Delayed delivery: the one capability to add

A wake-up due on 1 December must be delivered on 1 December, however many deployments happen in between. Options considered:

| Option | For | Against |
|---|---|---|
| **A. A delay in the broker contract** (`publish` takes `deliverAt`) | the broker keeps the timer; no polling | not what *every common broker* does: some lack it, some limit it (SQS 15 minutes, JetStream only recently); the contract would shrink or brokers would fake it; not transactional (a publish after the commit, the very problem the outbox solves) |
| **B. `deliverAt` in the transactional outbox** | broker agnostic; committed with the step that asked for it, so a rolled-back step sets no timer; the outbox already claims, retries, orders, replays and shows pending messages (in the database, queryable); a timer is a message like any other | resolution is the processor's polling interval; the table holds future messages; only channels with `transactionalOutbox` can delay |
| **C. A scheduler kind** (an entity or table of timers and a poller that publishes) | separate concern, explicit | a second durable queue next to the outbox with the same problems solved twice |

**B, built as R5.4** ([transactional-outbox](../implementation/platform/transactional-outbox/README.md)). The outbox already is "a durable list of messages that are delivered when due"; today "due" means "now, or after a failure's backoff". A message with `deliverAt` is the same with a later time.

- `message-outbox.put` and the channel's `publish` take `deliverAt` (an ISO date-time), valid only on a channel with `publisher.transactionalOutbox` (`invalid` at run time on one without; a static check of the `publish` node isn't built, since the message is mapped by the node's input).
- `claim` and the processor pick a message only when `deliverAt` has passed (already so, see below); an eager delivery after the commit is skipped for a delayed message. An overdue timer (the application was down) is simply due at the next start: late, never lost.
- **Groups: what the code does** (checked in [transactional-outbox-postgresql](../implementation/adapters/transactional-outbox-postgresql/README.md)). A message is already "delayed" by a future `process_after_timestamp_utc`: `outbox-insert` takes a `now` and writes it there, `claim` takes a message only when `process_after_timestamp_utc <= now`, and the partial index `outbox_pending` covers it, so `deliverAt` is just a later value in `put` and `publish` and nothing is polled that isn't due. The group rule is the catch: `claim` refuses a message when an earlier message of its group is pending or failed, and `lock-batch` takes the *head* of each group and tests whether the head is due, so a pending timer at the head hides every later message of the group, whether or not it is due. A retry backoff is also a future `process_after`, and it **must** keep holding its group back (ordering), so "a delayed message doesn't take part in the ordering until due" would need a new column to tell the two apart and a change of both queries.
- **Groups: proposal.** Give each timer **its own group**, `<process id>/timer/<token>`: no change of the claim and the lock queries, a signal is never blocked by a timer set for next month, and a timer needs no ordering with the process's other messages, since its token makes it check itself (§4). The cost: a timer and a signal that are due at once are two messages in two groups, so two runners may run steps of one process at once and one fails on the revision check (`conflict`), is retried by the broker and finds the new position (stale, or still valid). That is rare and harmless by §4: only one transition commits (the token and the revision decide which), the other fails with `stale`, a transient error of the registry (§10.1) that the consumer retries, and it finds the moved token and is dropped. The rule "no other signal while a transition is pending" (§3) is thus kept by the revision check and not only by the group. **Decided (decision 3).**
- `cancel({ messageId })` (pending only) lets a process remove a timer it no longer needs. Optional, since a stale timer is harmless (§4) and cancelling it is a space optimization.
- Precision is the processor's `idleIntervalInMilliseconds` (1 s by default). That's right for business waits (hours, days); the document says so and doesn't promise more.
- **The time.** The process kind and its pure mappings never read the time (P23). A wait has one of two forms, exactly one of them:
  - `until: { at: <mapping>, then }`: `at` is **a date computed from the participants by a pure mapping** (a policy's end date, a deadline field). Reproducible, and the message's `deliverAt` is that date. There is no date arithmetic in the vocabulary yet (only `dated-body`): "30 days before the end date" needs the pure function of F12, which the first version doesn't require.
  - `until: { after: { days?, hours?, minutes? }, then }`: a duration from the moment the wait begins, **resolved by the effect that puts the message**, which reads the `clock` of core (`clock-source.now`, an effect with `read`, as the outbox's own `now` is) inside the step's transaction. The step's `do` stays deterministic and a test stubs the clock, so a replay gives the same result. The duration is *elapsed time in UTC*: no business days, time zones or "end of the month" (an author who needs them computes an `at`). A step that rolls back and runs again measures from the retry, which is right since the wait begins when the step commits.
  - A structured duration, not an ISO-8601 string, since it fits the schema syntax and `validate()` can check it. **Decided (decision 4).**

Nothing else in messaging changes. The brokers stay as they are.

## 6. What starts a process and what signals it

### 6.0 How a user drives a process

A user never talks to a process. A user acts on an **entity**: attaches a document, updates a contract, answers a task. That is an ordinary entity operation, authorized at the boundary (P19) and checked by the state model and the guards, and it is recorded as an `entity-event`. The process only reacts: it **notices facts** (§2.1 `when`, §4): after the change of a participant it looks at the data and goes on if what it waits for is there. What it did stays visible as changes to entities, and who did what in the audit trail of the entity.

What the process asks of the user space is a **task** (§7): a work item the process creates and **closes itself, on the fact** (the document is attached, the answer is given and acceptable). A user never closes a task. A decision or an attestation, where no other entity shows the fact, is written by the user into the task as an `answer`, and the process decides on it. A signal remains for a message that is not a fact about an entity (§6.1).

Sources that put a wake-up on the channel:

| Source | Starts | Signals |
|---|---|---|
| A **trigger** on a message (an entity event, a partner's message) | `start` | `signal` |
| The **watcher** (§4): a change of a participant a wait reads | | `check` |
| A step of another process | `start` of the child | the child signals the parent back, through a change of an entity the parent holds |
| The **timer** (§5.2) | a delayed start (§6.3) | a timer wake-up |

A step of a parent that starts a child holds the same participants or others, and the parent waits `when` an entity shows that the child is done. A service of another system records what it did as an entity (an approval, an order) that a condition or a trigger uses.

### 6.1 The interface of a process, and triggers

A process and the messages that start or signal it are bound as a **port and its adapters**:

- **The process declares its interface**, in its definition: the schema of the `start` input (§2.4), the signals it accepts with their payload schemas and, for each signal, **how an instance is addressed**: `by`, the role whose entity identifies the instance (`"by": "contract"`: "the processes that hold this contract in that role"). The interface says nothing about channels or message shapes of other modules.
- **A `process-trigger` is an adapter, a separate element outside the definition.** It maps a message of any channel to a `start` or a `signal` of that interface. It knows the message and the interface, and nothing of the steps or the internals of the process. The rule "an issued contract starts its review" joins two domains and belongs to the application that composes them (G3), or to a module that ships it as a default; a module can add a source for a process it doesn't own without touching its definition (G9, P15). `bpf refs` lists who starts or signals a process.

A fact about an entity needs no trigger: a process notices it by a `when` (§2.1, §4), declaring what it reads, and the runtime watches it. A trigger is for what starts a process and for messages that are not facts about an entity (a partner's reply, a webhook).

```json
{ "kind": "process-trigger", "data": {
    "on": { "channel": "entity-events", "subject": "insurance-contract", "test": <the event is a transition to issued> },
    "start": { "process": "contract-issue-process-type", "entities": { "contract": <the event's entity> } } } }
```

```json
{ "kind": "process-trigger", "data": {
    "on": { "channel": "partner-replies", "test": <mapping over the message> },
    "signal": { "name": "partner-reply", "process": "contract-issue-process-type", "entity": <the contract the message is about>,
                "payload": <mapping over the message> } } }
```

- `on` is a channel, an optional `subject` (the broker's filter, so a trigger is never handed a message it didn't ask for) and a `test`, a pure mapping over the message that says whether it applies. `entity-events` is the channel of events of entity changes, but nothing is special about it: a partner's message or a webhook's is a channel too, with its own payload shape (P18).
- The effect is exactly one of `start: { process, entities, input? }` (the mappings build the bindings of the roles that aren't `late`) or `signal: { process, name, entity, payload? }`. The mappings see the message only (for an entity event: `eventType`, ids, `commands`, `by`), so a payload carries what the message has and a step reads the rest from the participants.
- **The work of resolving a target is split.** The converter extracts the *domain value* from the message, the entity the message is about, because only it knows the message. The process resolves that to instances through the `by` of the signal it declares, by the relation index (§2.0, §6.4): a contract's cancellation event reaches every issue process in which it is the `contract`, and the trigger names no internal role. A process that doesn't wait for the signal isn't affected: the `conflict` of an unexpected signal is dropped for a trigger, as stale.
- `validate()` checks a trigger's mappings against the channel's message schema, the signal against the interface of the process (declared, payload matching, `by` a role of the definition) and the start's entities against the roles that aren't `late`.

#### Three consumers

Everything that moves a process is a `message-consumer`, and only the runner executes steps:

| Consumer | Consumes | Does |
|---|---|---|
| **Converter** (a trigger) | any channel | a stateless mapping that resolves the target and puts a `start` or a `signal` wake-up in the outbox |
| **Watcher** | `entity-view-changes`, put by the publisher of changes (a `reactions` fill, §4) | finds the processes that hold the changed entity in the role of a changed view and puts a `check` for each (§4) |
| **Runner** | `process-wakeups` | runs the step in a transaction (§3) |

The converters and the watcher could run the step themselves, but they run under the ordering group of their *source* (the contract's events, say), so two steps of one process could run at once and fail on the revision check. The extra hop through `process-wakeups` regroups by process id, which serializes the steps of one process, and the converters stay free of transactions and of any knowledge of the process.

### 6.2 A start happens once

Messages are delivered at least once, so a trigger can see the same message twice, and two different messages can ask for the same process. The business key of a process entity is therefore **derived, not generated**: the entity type's `business-key` rule (the existing trait) builds it from the definition and the entities bound at the start, by default `<definition>/<key of each non-late role, in the order of the definition>` (`contract-issue-process/C-1042`). A second `start` for the same participants finds the key taken and fails as `conflict`, which a trigger drops as already started. Nothing else is needed: no table of handled messages, the uniqueness of the key is the arbiter, as the revision is for steps (§4).

A process that may run again for the same participants (a yearly renewal of one contract) says what distinguishes the runs in its key: a role or an input value that the rule includes (`renewal/C-1042/2027`). The definition declares which; a definition whose key would not distinguish two legitimate runs is a mistake that shows only when the second is refused, so `explain` shows the rule.

### 6.3 A start by the clock

The framework has no now (P23): nothing starts a process because "it is the first of the month". A date is given, and the timer of §5 delivers it:

- a **delayed start message**: something puts a message with `deliverAt` on a channel, and a trigger on that channel starts the process. A *schedule* is data (an entity or an element listing the next date and the process to start), and whoever sets the schedule is a process or an operation like any other; the framework has no cron;
- a **process that starts its successor**: the last step of a run waits `until` the date of the next one and the step that follows `start`s the new run. This is the recurring process written in the language of processes, and it is how a yearly renewal chains.

A schedule element and a recurring trigger are a later addition (§13, R5.3c), after the delayed start message exists.

### 6.4 The lookup by participant

Every message of a participant type runs "processes holding entity E in role R", so the lookup by target must be indexed. The table `entity_relations` had the primary key (source, target, type), so a lookup by target would have scanned it, and the one query, `entity-relations-of`, was by source. **Built (R5.7):** `entity-relations-to({ targetEntityId, relationType? })` and the index on (target, relation type) ([entity-relations](../implementation/entity/entity-relations/README.md)). What R5.3a adds to it:

- a `relations` fill on the process entity type that maps `data.process.entities` to relations, the **role** being the `relationType` (the relation slot's rules already receive the written record; targets must exist, and a late-bound entity does, since the step created it earlier in the same transaction);
- **the relations of a finished process are dropped**: the rule returns none once `status` is `ended` or `aborted`. Targets are `ON DELETE RESTRICT`, so otherwise a participant of a finished process could never be deleted. The relation then means "a **running** process holds this entity in this role", which is exactly what the watcher and the signals need.

The lookup returns every running process that holds the entity in the role, waiting with a `when` or not; the watcher narrows by the `watch` list of the loaded process.

## 7. Tasks: the protocol with the user space

A **task** is an entity through which a process asks the user space for something and keeps track of it: a work item with a closed set of outcomes. A process, a work list and the authorization all rely on its shape, so the shape and the protocol are fixed once, generically.

**Principle: a task is closed by the process, on a fact, never by the user's word.** If a user could close a task, nothing would guarantee that the requested action happened ("attach the document" closed with no document). So the user does the real action on an entity (attaches the document); the process **verifies it against the data** with a condition (`when`, §2.1) and closes the task when the condition holds. A task is the user-facing request for something the process waits for; the fact is what the process waits for.

### 7.1 The shape of a task

A task type is an entity type with the trait **`task`** (a `valued-entity-trait`); the type-specific data stay in `body`, as for any entity. The trait is configured by the **outcomes** the process may close a task of this type with, and who may work on it:

```json
{ "id": "review-task", "kind": "entity-type", "data": { "traits": {
    "task": { "configuration": {
        "actor": "underwriter",
        "outcomes": { "approved": { "answer": true },
                      "rejected": { "answer": { "!reason": "string" } },
                      "timed-out": true } } },
    "body": { "configuration": { "schema": { "contractNote": "string" } } } } } }
```

An outcome with `answer` is one a **user may give** (the `true` or the schema of its data); an outcome without it can only be reached by a condition of the process (`timed-out`, or "document attached" in a task that asks for an action on another entity). The value under `data.task`:

| Field | Meaning |
|---|---|
| `status` | `open` → `resolved` \| `cancelled`; both are terminal. The graph is fixed by the trait, so nothing is checked at run time (as `to` of the [state trait](../implementation/entity/entity-states/README.md#restricting-the-moves-of-a-dimension)) |
| `origin` | `{ process, step }`: the delegating process and the step that created the task; also recorded as an entity relation |
| `about` | the entities the task concerns, `[{ entityType, businessKey }]`, recorded as relations: a user sees the context, and "tasks about this contract" is a query |
| `actor` | the actor (P20) that may work on it; from the configuration, or set by the creating step |
| `assignedTo` | optional: the user who took it (`claim`), for work lists |
| `dueOn` | optional, a date given by the step (P23), for work lists. A task never expires by itself: the process decides what a missed date means |
| `answer` | optional: `{ outcome, result?, by }`, what a user said (see below); not a closure |
| `outcome` | set when the process closes the task: the outcome whose condition held, or `cancelled` has none |

A work list is generic: every task of every type has `status`, `about`, `actor`, `dueOn` and the outcomes it accepts, so one list shows the tasks of an actor; only `body` (what the user needs to see) and `answer` differ by type.

### 7.2 Who does what

| | Process (the runner) | User space (a user, or a system acting as the actor) |
|---|---|---|
| **Creates** the task | yes, in a step, in its transaction | no |
| **Does the work** | no | yes: the real action on entities (attach the document), or `answer` |
| **Closes** it, `resolve` (with an outcome) | **yes, when a condition over the data holds** | **never** |
| **Withdraws** it, `cancel` | yes | no |

- **`answer({ businessKey, revision, outcome, result? })`** is the only public operation of the trait besides `claim`. It records what a user said (a decision, an attestation: "I phoned the customer") in `answer`, for an outcome that has `answer`, with a result that matches its schema, while the task is `open`. It closes nothing; a later answer replaces it while the task is open. Authorization is that of any entity operation (P19): the operation `answer` with the outcome as a dimension, so an actor may be granted `approved` and `rejected` separately, as transitions are granted one by one ([authorization](../implementation/services/authorization/README.md)): the endpoint's `operation` mapping sees its `input`, so `action: "#.input.outcome"` works, provided the dimension is a closed set, which a schema of every task outcome name registered at load gives, as `entity-transition` does for transitions (prerequisite 4, §13.1).
- **`resolve({ outcome })` and `cancel`** are private to the framework and are called by the runner only; a closed task records the outcome and the process step. The runner acts as the system (§3.0).
- A system that works on tasks (a rating service) is an actor like a person, and does the same: acts on entities or gives an answer. Delegating to a human or to a machine is the same protocol.

The trust rule follows: *what a task says happened is what the data say*. An answer is a fact too (the entity records who said it and when, through the event), and the process decides whether to trust it: the condition `answer.outcome == "approved"` is also a check that the answer is there and valid (the operation checked its schema and that the user may give it).

### 7.3 The protocol

1. **Delegate.** A step creates the task by the ordinary `create` of the task type (`origin`, `about`, `body` from the step's data) and binds it as a role (`late`, §2.0), in the step's transaction, so a task exists only once the process has reached the step and committed (a rolled-back step, or a chain that never gets there, creates none, §3); if the step rolls back, no task exists. It then waits with `when` entries that name the task in `resolve`.
2. **Offer.** The task is an entity: the actor sees it in a work list (search, row access by actor); nothing about the process is needed for that.
3. **Act.** The user does what the task asks, on the entities concerned or in `answer`. The process isn't involved: the user space and the process are decoupled by data and entity events (G9).
4. **Verify and close.** The runner evaluates the `when` entries when the wait starts and again after any change of a participant they read (§4); the first entry whose condition holds closes the tasks it lists in `resolve` with the outcome it names, and the process goes to its `then`. The condition is read from the **current data** of the participants, never from the event: the event only says "look".

   ```json
   "wait": { "when": [ { "test": { "$eq": ["#.entities.review.data.task.answer.outcome", "approved"] },
                         "resolve": { "review": "approved" }, "then": "activate" },
                       { "test": { "$eq": ["#.entities.review.data.task.answer.outcome", "rejected"] },
                         "resolve": { "review": "rejected" }, "then": "close" } ],
             "until": { "at": "…", "then": "remind" } }
   ```

   `validate()` checks each `resolve`: the role is declared and is a task type, the outcome is one that type declares, and every outcome a user may give (`answer`) is routed by some entry (so an answer can't lead to a dead end).
5. **Continue.** The step reads what it needs from the entities (the answer, the document) and goes on.
6. **Withdraw what is left.** When the process leaves a wait by another entry (the timer, a signal, another condition), ends or is aborted (§2.3), the runner cancels, in the same transaction, every task named in the `resolve` of that wait that is still `open`, and any task still open when the process ends. A process never leaves a task nobody should work on. A user who answers a task cancelled a moment before gets `conflict`; the revision of the task decides a race.

### 7.4 Why the process closes tasks

- **Verification needs the process's expectation.** The same task type, "attach a document", is complete under different conditions in different processes (a document of a given kind, of a given contract, signed). The condition belongs to the process that holds the expectation, in the vocabulary of its roles, and is checked by `validate()` against their types; the task type stays generic and knows nothing about processes (G9).
- **A condition over data is level-triggered**, not edge-triggered: a document attached before the wait began is found when it starts, and a duplicate or late event does no harm, since the check reads the current state. This removes the lost-wakeup and ordering problems a signal has.
- **A user's word is data, not a closure.** The one case with nothing to check on another entity, a decision or an attestation, has the user write the answer into the task, and the process closes the task when the answer is there and acceptable. The process can also refuse or ignore an answer: a rule such as "the approver must not be the author" is a condition over the data.
- **A cost:** every change of a participant of a waiting process runs its conditions again (§4). Only processes with a `when` in their wait pay, and a condition is a cheap pure mapping.

### 7.5 What the protocol does not do yet

- **Several tasks in one wait** (all of three approve, any of two): a role with `many` and a rule in the condition (a count, `all`, `any`) over the answers of its tasks. It needs no new mechanism, only helper functions; a later addition (§12).
- **Assignment and reassignment** beyond `claim` and the actor: work distribution, delegation, substitutes.
- **Comments, attachments, a thread**: ordinary entities that point `about` the task.

## 8. Extension points

F12 says steps others may extend are declared as slots, since step names become public API. The first version:

- a step is **public API only if the definition marks it** `extensible: true`; then its `do` is followed by the fills of the slot `process-step` of that step (ordered by `position`, `after`, `before`, as every slot). A module that adds a compliance check to "issue" fills the slot; the definition's author did not have to know it.
- the graph (the edges and waits) is **not** extensible; a subdefinition may be built with the data algebra over the base definition, as a state model is (`/merge`, `/unset`), and `validate()` rechecks the result.

## 9. Versioning running processes

The instance stores `definition` (the element id). **The framework gives no versioning and no migration; the author owns the consistency.** Two ways to change a definition, and the choice and its consequences are the author's:

- **A new version as a new definition** (`contract-issue-process-2`): new starts name the new id (a trigger's `target`, §6.1), running instances continue on the old one, which must stay deployed while any instance uses it. Nothing is ever interpreted differently from how it was started. This is the way that needs no care.
- **An edit in place:** the author guarantees that every live instance is in a state the new text can continue from. Adding a step is harmless. Renaming or removing the step an instance waits in, or changing its wait (`when`, `signals`, `until`, the roles it reads), is not: the stored `step` and `wait` (the `watch` list, the token) are those of the old text. The framework doesn't check this, since instances are data and `validate()` doesn't see them.

What the framework does at run time: a wake-up for an instance whose `definition`, or whose `step`, the loaded elements don't contain fails with the terminal error `unknown-definition` (a code of the process package, §10.1), and the breaker suspends the instance with the `fault` recorded (§10.2). A removed or broken definition is thus visible and recoverable, not a silent loss: the stuck-process query (§10) lists the suspended instances and their `fault`.

There is no `migrate` operation. A migration is the author's own program (a script over the entities, which writes the `process` trait like any trait through its operations), written when needed. **Decided (decision 5).**

## 10. Failure and operations

- **A step throws.** The transaction rolls back and the process stays where it was, *waiting*, correctly and visibly. What happens next follows from the *nature* of the error (§10.1): a transient error is retried by the consumer (`consumer.retry`), an outage waits without counting, a terminal error is not retried at all. A failure that goes on is not left silent: the runner's circuit breaker suspends the process with the fault recorded (§10.2).
- **Stuck processes** are found by data, not by an execution log: the process is an entity, so *waiting with `until` in the past* is a search query. Nothing indexes `data.process` by itself: the process entity type fills the slot `searchIndex` of [entity-search](../implementation/entity/entity-search/README.md) with a mapping from the record to a document (`step`, `wait.until`, the roles), and the query needs a date filter (filters and sorts exist, row access uses filter trees; a date-range filter is untested) and a reindex that isn't limited to the first 200 records (F38), and a retry is `signal`/a replay of the wake-up (the outbox's `replay`). An operator can see every process, where it is and since when. A stuck process is handled by the operator's transitions of `status` (§2.3): `suspend` stops it, `abort` ends it, and `resume` re-evaluates it on the current data.
- **Business failure** (a refusal) is a branch of the graph, declared on the step: foreseeable refusals are written as `choose` on a precondition; a refusal the author can't test beforehand is caught by `onError` (§2.1) on its terminal code, the step's work is rolled back whole, and the process goes on to the step the entry names. A refusal nobody declared is a fault (§10.2). **Decision 6.**
- **What the framework doesn't keep**: a history of steps. The entity events carry the position changes (`commands` with the key `process`), so a consumer that needs a timeline builds it (the core keeps no history of commands, by the same rule).
- **Observability**: the context `process` is bound while a step runs and the `trace` correlation flows on, so a log of one request shows the steps it ran.

### 10.1 What a failure is: the error registry

A failure is handled by what it *is*, and today nothing says: an error code is a free string, so the consumer retries everything the same way and `conflict` means four things (a stale revision, a duplicate key, a record still referenced, a refusal of the state model or of a rule) of which only the first is cured by a retry. the registry this design needs is built ([core](../implementation/core/README.md#error-types)):

- **A singleton `error-registry`** (kind of core) **with the slot `errorTypes`**, filled by every package for the codes it throws, as `authorization` has `dimensions`: `{ code, http?, transient?, outage?, extends? }`. The code is a field, not the id of the fill (element ids are one namespace, and `invalid` or `conflict` would claim common words).
  - `http`: the status at the HTTP boundary; it replaces the table of the server.
  - `transient`: repeating the same work later can succeed. `false` (the default) is *terminal*: the same input fails the same way.
  - `outage` (only with `transient`): a dependency is down, not the work, so the attempt is not counted. It is the special case the outbox has today for `unavailable`.
  - `extends`: the properties of the parent, overridden by the child. `stale`, `duplicate`, `referenced` and `state-refused` extend `conflict` (409); only `stale`, the revision mismatch, is transient.
- **The error stays `{ code, message, data }`.** A pure `$func/error-type` resolves a code to `{ http, transient, outage }`, once at boot (the elements are fixed); an unregistered code is terminal, 500.
- **The registry says what a failure is; the mechanism decides what to do.** Attempts, backoff and the breaker's limit stay settings of the consumer channel, the outbox and the runner. The consumers read `transient` and `outage`: a terminal error ends the attempts at once, an outage pauses and counts nothing.
- **`validate()`** reports a code registered twice, an unknown parent, a cycle, a literal `throw` and an entry of an operation's `errors` that name no registered code.

### 10.2 The circuit breaker of the runner (decision 6)

- **What the runner does with the error of a step**, after the transaction rolled back:
  - *transient*: the error propagates, the broker retries as the channel says, and the runner counts consecutive failures of the same step on the process; after `breaker.attempts` (a setting of the process kind) it suspends the process;
  - *outage*: nothing is counted, the consumer pauses as it does now;
  - *terminal*, matched by an `onError` entry of the step: the work of the step is rolled back to its savepoint, the entry's `set` runs and the process goes to its `then`, in the same transaction, with nothing counted: a declared outcome is not a fault;
  - *terminal*, matched by none: no retry would change anything, so the process is suspended at once.
- **Suspending records the fault.** The process stores `fault: { step, code, message, attempts, wakeup }` (`wakeup` is the message being handled: its kind, name and payload; written by the runner in a small transaction of its own, since the step's one has rolled back; no time is stored, the entity record has its `timestampUtc`, P23), and `status` becomes `suspended` (§2.3). A stuck process is *visible and recoverable*, not silently waiting: the operator fixes the cause and `resume`s, which puts the kept `wakeup` again *first* (so the failed transition is made with the input it had), clears `fault`, evaluates the facts and re-arms the timer (decision 13), or `abort`s, which clears `fault` without replaying. Why the failed wake-up is kept and later ones aren't: the process stays in the state it was in (the failed transaction rolled back), but a transition caused by that wake-up is pending, and no other signal is processed before it is made. The failed wake-up is its cause, a later one is not, and a signal is the one wake-up that can't be derived again (a fact is re-read by `check`, a timer is re-armed from `until`).
- **The count lives on the process**, not in the broker, so it survives a restart and belongs to the step: it is reset by a step that succeeds. It is a field beside `step` and `wait`, written with the same revision.
- **The savepoint.** `do` is atomic as a unit of the step: the runner runs each step inside a nested scope of the transaction, and a caught error rolls back to it. The scope covers the step's writes, the entities it created, the messages put in the outbox and the `afterCommit` work it registered, which is dropped. The transaction wrapper has no such scope today (a nested `inTransaction` joins the outer one, §13.1, prerequisite 10). The steps of the chain before the failed one stay in the transaction and commit with it.
- **A `try`/`catch` node inside `do`** is not the mechanism: it catches the error but keeps the writes made before it, so it would break the atomicity of the step. `onError` is the declared way, and `validate()` reports a `try` in the `do` of a step with a `catch` that continues after a write (proposed).

## 11. Why this is minimal (G7) and what it costs

- **Core**: no change. A process is a kind, a trait, a consumer and a runner: elements and `low`/pipeline code in a package `process` of the `entity` group (`entity-processes`), after `entity-states` and `entity-events`.
- **Messaging**: one added capability, `deliverAt` in the outbox (and `cancel`), no broker change.
- **Counted scenarios** (the measure of [critique](critique.md)):
  - *Add a wait with a timeout to a process*: one step entry in the definition (the `wait`), plus the target step. One place.
  - *Add a step*: one entry, one edge in another step. `validate()` reports an orphan.
  - *Extend a step from another module*: one slot fill; the definition is untouched.
  - *Rename a step*: `bpf refs` lists the edges and the stored instances' step names are the one migration (§9).
  - *Run a process in a test*: stubbed effects and a stubbed outbox; the steps are pipelines over participants, so a test creates them and the process, calls `signal` and reads the records, with no broker and no clock ([interpreters](../implementation/core/README.md#interpreters)).

## 12. What this design does not do

- **No durable execution inside a pipeline.** A `do` that must wait is two steps. This is P14 and the reason the model is simple.
- **No parallel branches** in the first version. Parallel work is several processes (a step `start`s them and waits for their `signal`s) or several `wait.signals` in one wait; a join (wait for all of n) is a step that counts, written as ordinary data on the record. If real cases appear, the design reopens with the case.
- **No compensation framework (sagas).** A compensation is a step that undoes, reached by the graph: written by hand, checked by `validate()`.
- **No full human-task model** (the protocol is §7; assignment and distribution, work lists beyond the generic listing). That's a layer over this one: a step creates a task entity (§6.0) and waits for the signal a trigger gives from its transitions; assigning tasks to actors (P20), work lists and escalation belong to it.

## 13. Build order

0. **The error registry and the savepoints** (R5.5 and R5.6 of the [plan](refactoring-plan.md); prerequisites 9 and 10 of §13.1), and the lookup by target (R5.7, prerequisite 2): before the runner, since the retry of the consumer, the outbox and the breaker read it.
1. **R5.4** (messaging): `deliverAt` in `message-outbox.put` and the channel's `publish` (the claim and the processor already honour a future `process_after`, §5.2), a group per timer; the `transactional-outbox-postgresql` queries and a migration; `cancel`; tests with stubbed time and a real processor; README of `transactional-outbox` and `messaging` updated.
2. **R5.3a** (model; the prerequisites 2 and 6 of §13.1 first): `process-definition`, the `process` trait with its private `start`, `signal` and timer, the runner, the wake-up channel and consumer, `validate()` for the graph. Tests with stubbed effects.
3. **R5.3b** (conditions and tasks, §2.1, §4, §7): `when` with its derived views, the publisher of changes, the watcher and `check` (prerequisite 11); the trait `task` in its own package `entity-tasks` (decision 9), with `answer` and `claim` (public) and `resolve` and `cancel` (private); the withdrawal of open tasks when a wait ends; `validate()` of `when`; a work-list query by actor.
4. **R5.3c** (demo): the contract issue process above, with a review task and a reminder timer; an end-to-end test with PostgreSQL and the outbox, the date given.
5. **R5.3d**: `process-trigger` with the derived key of §6.2, the extension slot (§8), the stuck-process query (§10); the circuit breaker with `failures` and `fault` and the `onError` exit with its savepoint (§10.2, prerequisite 10) belong to R5.3a, since the runner needs them from the start; then schedules (§6.3).

Each step leaves the system working, with its tests passing.

### 13.2 What was built, and where it differs from the design

All steps of §13 are built and tested (R5.5, R5.6, R5.7, R5.4, R5.3a–d). The differences, each recorded in the README that owns it:

- **The channel of the publisher** is `entity-view-changes` (the schema `entity-change` is a write), and its message is `{ entityType, id, businessKey, revision, changed, via? }`; `via` is the definition and key of the process whose step wrote. **Not built:** the slot `signalViews` (no consumer before triggers needed it), the revision narrowing of the runner (`wait.watch`: a relevant change costs one read of the participants), and `via` in `entity-events`.
- **`resolve` and `cancel` of a task are public operations refused by a guard of the trait** with `private-operation` (403) for a principal without the role `system`. A private operation can only be invoked by the element itself, so the process couldn't call it on a task type. The runner and the closing of tasks run as the system (`asSystem`), as §3.0 says.
- **The grant of `answer` by outcome** (prerequisite 4) is built in the HTTP route (the schema `task-outcome-name`), not in the trait's own operation. The work list is a search over a shared index of tasks (`$func/task-search-document`, [entity-tasks](../implementation/entity/entity-tasks/README.md#work-list)); the relations of `about` are (open tasks only, so a closed task doesn't hold its entity).
- **The demo's timer is a timeout, not a reminder.** Leaving a wait cancels its tasks (§7.3, 6), so a reminder that waits again would sit on a cancelled task; a reminder needs a second task or a wait that keeps the first.
- **The data flow of a step** is typed by `validate()` ([entity-processes](../implementation/entity/entity-processes/README.md#typing-a-step)) for the roles, the input and the variables, in a `do` and in every mapping; the body of a participant only where its schema is closed, and every other trait is any (F77).
- **Triggers** are a subkind of `message-consumer` whose handler calls the trigger's own operation `convert` (the test and the mappings are data of the instance, run with `$func/apply-mapping`); the signal's target is found by the relation index. **Schedules** aren't built (a delayed start message already does the job). **The reindex without the 200 limit** is still F38.
- **Tasks are declared apart from the roles, and opened by a declaration.** The definition has a section `tasks` (`{ type, about? }`) beside `entities`, a step has `open` (the counterpart of `resolve`), and mappings read a task at `#.tasks.<name>`. Internally a task is a `late` role of its type (so the binding, the relations, the footprint and the views work as for any participant); the runner opens it after the `do` of the step, derives its key (`<process key>.<name>`: a slash would break the HTTP route of the task) and fills `origin` and `about`. Reopening a task that is open changes nothing, one that is closed is a `conflict`. The `invoke … create` and the `bind` of the earlier form are gone.
- **A transition of a participant is a declaration too.** A step has `transition: { <role>: <name> }`, run after the `do` from the revision then current, in the step's savepoint, so the most common effect of a process on its entities needs neither the trait, the operation nor the revision spelled out, and `validate()` can check the role and the transition. The refusal is the step's error (`state-refused`), caught by `onError`.
- **The extension slot** is `stepExtensions` of `process-definition` with `{ step, do }` values, run after the `do` of a step marked `extensible`.

### 13.1 Prerequisites in existing packages (checked against the code)

1. **Outbox:** `deliverAt` in `put` and `publish` (the column and the claim already exist, §5.2); `cancel`; a validation of the channel. No change of `claim` and `lock-batch` with a group per timer.
2. **entity-relations:** the query by target and its index, and the migration (§6.4): built as R5.7; the process entity type's `relations` fill remains.
3. **Optional, not required by processes: static shapes of trait values.** Each trait kind declares the structure of its value as the `output` of `initialize` and of its operations (`trait-command` has `value: @any` today), which `invoke` already checks at run time and the data flow reads; the body-like kinds are overridden by their configured `schema`, in one shared record type that replaces the copies in ownership and amendments. Nothing configuration-dependent (dimension names, state names, outcome names) is written into a shape: that would be a second source of truth. A shape derived from the configuration has no consumer today and is not built. It is a separate improvement, to be recorded in the critique on its own.
4. **A schema of the task outcome names**, registered at load, for the authorization dimension of `answer` (§7.2).
5. **entity-search:** the `searchIndex` fill of the process entity type, a date filter and a reindex without the 200 limit (§10).
6. **The paths a `when` reads:** a lexical scan of `#.entities.<role>.<path>` in the string leaves, as `recordKeysRead` of entities does for `#.data.<key>`, gives per definition and role the union of the paths its tests read, which is the derived view (§4); a path it can't see (`$get` with a computed path, `#.entities` used whole) makes the view the whole record.
7. **The principal of the runner: decided** (§3.0): `asSystem`, no principal of a process. The handler of the runner consumer is wrapped in it; the guard on entity writes that enforces the footprint is a fill of the slot `requestGuards` of `entity-type` by the process package, reading the context `process`. Authorization, state permissions and row access already skip the principal, by the constant `'system'` that each of the last two package holds.
8. **entity-events:** the field `via: { process, step }` of the message, set from the context `process` when it is bound (§14, 11).
9. **The error registry, first of all (built as R5.5):** the kind `error-registry` and `$func/error-type` in core, the fills of every package for its codes (core's `invalid`, `not-found`, `unauthorized`, `forbidden`, `conflict`, `unavailable`, `internal`; `stale`, `duplicate`, `referenced`, `state-refused` split from `conflict` in entities, the database adapter and states; `unknown-definition`, terminal, by the process package), the consumers of messaging and the outbox reading `transient` and `outage`, the HTTP status read from the registry, and the `validate()` checks (§10.1). Built; what was verified on the way: an error from a `low` module becomes `low-failed` ([calls.js](../implementation/core/src/execution/nodes/calls.js)), registered terminal under `internal`, and the runtime codes of core's own JS are unregistered and so terminal by default; a database that can't be reached is `unavailable` (the PostgreSQL adapter classifies it), and an `integration` lets an outage pass undeclared, otherwise a down database would have surfaced as terminal `undeclared-error`; `validate()` reports a literal `throw` of an unregistered code and a declared `errors` entry that is unregistered.
10. **Savepoints in the transaction wrapper** (verified: the `transaction-manager` has `begin`, `commit` and `rollback` on the sessions of the database, `inTransaction` joins an enclosing transaction, and nothing nests; the PostgreSQL adapter runs `BEGIN`, `COMMIT`, `ROLLBACK`): a nested scope that is `SAVEPOINT`/`ROLLBACK TO`/`RELEASE` on the same session, a way to run a pipeline in it, and the drop of the `afterCommit` pipelines registered inside a scope that rolled back. The runner uses it for each step (§10.2).
11. **The publisher of changes (§4):** the slot `signalViews` on `entity-type` (`many`, `{ name, view }`, `view` a mapping from the viewed record), the `reactions` fill that computes the views on `before` and `after` and publishes `entity-change` through the outbox, the channel `entity-view-changes` (topic, outbox, subject the entity type, group as `eventGroup`), and `$func/process-views` over the instances of `process-definition` (`$func/instances-of` exists; **verified:** fills are elements and `slotValues` selects them by `target` at call time, so a fill can't be derived from another element, which is why the definitions' views are a function and the slot is for explicit ones). `validate()` types each view against the record. **Not verified:** the memoization of the function per entity type (the registry has `memo`, reset in tests). It replaces the watcher's use of `entity-events`, so the stale `entity-event` schema (the schema declares `key` and `command`, the message carries `commands`) is a small finding of its own and no prerequisite of the watcher.

## 14. Decisions to take

1. **Decided:** the process is an entity of its own (the `process` trait on a process entity type), separate from the participants it drives (named roles, §2.0). A trait reuses revisions, search, events, authorization and row access; and since only the runner writes the process entity, its revision is the wait's token.
   - **Decided:** a role may be bound late, by a step that generates the entity, and never rebound.
   - **Decided:** the footprint of a process is its roles; a write outside them is refused and `validate()` checks the definition against them.
   - **Decided:** data flow (§2.4): four sources (participants, process variables as the process's `body`, `input`/`signal`, step `output`), control only through declared exits, persistence only through a declared `set`; input, variables and signal payloads are typed in the definition.
   - **Decided:** a user drives a process only through entities (§6.0): the process has no public operations; a fact on a participant is noticed by the process (`check`), and a human decision is an entity (a task) the process creates; wake-ups travel on one internal channel `process-wakeups` (kinds `start`, `signal`, `check`, `timer`), ordered per process by the group.
   - **Decided:** a task is the protocol with the user space (§7): a generic shape (the trait `task`: status, origin, about, actor, assignedTo, dueOn, answer, outcome); the process creates a task and **closes it itself when a condition over the data holds** (`when`, evaluated when the wait begins and after every change of a participant it reads, level-triggered); a user never closes a task, but does the real action on entities or gives an `answer`, which the process judges; the runner cancels what a wait leaves open. Signals remain for messages that are not facts about entities.
   - **Decided:** the process is the system (§3.0): its steps run as `system`, it has all rights, security is guaranteed by the guards at the boundary of the user space, and the principal never propagates; no other internal principal is introduced.
2. **Decided:** the position is the process's own value (`step`), not a dimension of the `state` trait (§2.3). The process entity type also carries a real `state` trait with the dimension `status` (`running`, `suspended`, `aborted`, `ended`) for the operator's lifecycle: `suspend`, `resume` and `abort` are granted to an actor by the existing transition authorization, and the transition `end` is the runner's, made when the definition reaches an `end`.
3. **Decided: delayed messages and group order** (§5.2): a separate group per timer, `<process id>/timer/<token>`; no change of the outbox's queries; a timer and a signal due together run in two groups, and the revision check lets one transition commit (`stale` is transient and retried).
4. **Decided: relative waits** (§5.2): `until` takes `at` (a date from a pure mapping) or `after` (a structured elapsed duration in UTC, `{ days?, hours?, minutes? }`), resolved by the effect that puts the message through the `clock`; date arithmetic (F12) isn't needed for the first version.
5. **Decided: versioning** (§9) is the author's responsibility. A new version is a new definition id (new starts name it, running instances stay pinned, the old one stays deployed); an edit in place is the author's guarantee that live instances are in states the new text can continue from. The framework does not migrate, and a missing definition or step is the terminal error `unknown-definition`, which suspends the instance with a `fault` (§10.2).
6. **Failure in a step** (§10): the vocabulary of the process has an error branch, **`onError`** on a step (§2.1), while `do` stays atomic: the step's work is rolled back whole (a savepoint) before the entry is taken. It catches terminal errors only; a transient one is retried whatever the step says. Foreseeable refusals remain `choose` on a precondition.
   - **Decided:** what a failure is comes from a registry of error types that every package fills (§10.1); `transient`/terminal/`outage` drive the retry, the outbox and the breaker, and the policy stays a setting of the mechanism.
   - **Proposed:** the breaker of the runner (§10.2): `breaker.attempts` a setting of the process kind; a terminal error suspends at once, an outage counts nothing; `fault` and `failures` live on the process; `resume` clears them.
   - **Decided (the answer to the old open point):** an `onError` entry matches by `extends`, so naming `conflict` catches `duplicate`, `referenced` and `state-refused`, never `stale`, which is transient and always propagates. That is what removes the ambiguity of `conflict`, and `stale` can extend `conflict` for the HTTP clients.
   - **Open:** whether `outage` is a flag (proposed) or a third nature.
7. **Decided: where the package lives**: `entity/entity-processes` (it depends on entities, states, events and the outbox), with the task trait in its own package (decision 9).
8. **Decided: parallelism and several tasks in one wait** (all/any of n) stay out of the first version (§7.5, §12).
9. **Decided: the task trait has its own package `entity-tasks`**: a process uses tasks, but a task is useful without a process, and the task trigger and the work lists belong to it.
10. **Decided: cost of conditions** (§4). A `when` is checked after a change of what its tests read, nothing more: the publisher of changes (a `reactions` fill, in the transaction, with the viewed `before` and `after`) computes the registered views before and after the write and publishes the *names* of the views that changed, so a write that changes none costs two pure mappings and publishes nothing; the watcher looks up the processes, which stays out of the user's transaction; the runner drops a check that is no news (`revision` not above what the wait saw, or `via` itself) without reading a participant. The views of the definitions are derived from the paths of the tests; explicit views (a trigger's, an extension's) fill the slot `signalViews`. Not proposed: values in the message (names only), deciding a fact from the message (a read of the participants stays the evaluation), a lookup in the write path.
11. **Decided: attribution of a step's changes.** An event of an entity changed while the context `process` is bound carries `via: { process, step }` beside `by: "system"` (`process` the key of the process entity, `step` the step that ran), so an audit says which process made a change; a change of no process has no `via`. A small change of [entity-events](../implementation/entity/entity-events/README.md), an added field of the message, which a consumer that doesn't know it ignores.
12. **Decided: reads of a step** are limited to the roles by `validate()` only (a `do` that reads an entity type no role declares, or a role it can't have bound yet, is reported, §2.0); nothing refuses a read at run time, since a guard on reads would need machinery that doesn't exist and reads change nothing. The writes are the ones guarded at run time (§3.0).
13. **Decided: signals while a process is suspended.** A process takes no other signal while a transition is pending: a wake-up is the cause of one atomic transition (§3). A wake-up that arrives while the process is suspended is dropped, logged with its correlation, nothing stored. The exception is the wake-up that caused the fault, kept in `fault.wakeup` and replayed first by `resume` (§10.2); `abort` clears it. A fact and a timer are made up by `resume` (a `check`, the timer put again, §2.3).
