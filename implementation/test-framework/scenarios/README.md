# scenarios

A test as an element. A `scenario` names the packages it needs plus its own `given` elements, replaces effects by the stubs of its `stubSets`, runs its `act` (an ordinary pipeline) and then checks its `assert`. Scenarios with the same packages and effects form a group that boots once; the stubs are built again for every scenario, so scenarios share no state.

| Element | Role |
|---|---|
| `scenario-environment` | what scenarios share: `packages[]`, `stubSets[]`, `effects[]` |
| `scenario` | `environment` (an id of a `scenario-environment` in the scenario files), `packages[]` and `stubSets[]` (added to the environment's, without repeats), `given[]` (ids of the elements added to the boot of its group), `effects[]` (default: the environment's, else `trace`), `act`, `assert[]` |
| `stub-set` | `stubs`: `{ <element or kind id>: { <operation>: { answer: <mapping over the operation's input> } } }` and `fakes[]`: `{ module, export }`, a factory called for every scenario, which is how its memory is reset, that returns stubs of the same shape as JS functions, for a stub that needs memory (see [entities-in-memory](../entities-in-memory/README.md)); a later set overrides an earlier one per operation; reusable by several scenarios, see [interpreters](../../core/README.md#interpreters) |
| `assertion` | `{ actual, expected }`, two mappings over the scope after `act`: the `outputKey`s of its top-level nodes, and `calls`, the inputs of every stubbed operation in call order (`#.calls.<element>.<operation>`) |

An assertion is data, not a node of `act`: it holds when `actual` matches `expected`, and the first that doesn't fails the scenario with `assertion-failed` (`data.actual`, `data.expected`). Matching is partial: an object matches by the keys of `expected`, a list by all its items (same length), anything else by value.

```json
[
    { "id": "entity-events-scenario-environment", "kind": "scenario-environment", "data": { "packages": ["entities", "entity-events"], "stubSets": ["event-effects-stub-set"] } },
    { "id": "guarded-order-entity-type", "kind": "entity-type", "data": { "traits": { "body": { "configuration": { "schema": { "!amount": "number" } } } } } },
    {
        "id": "order-create-refused-by-guard-scenario",
        "kind": "scenario",
        "data": {
            "environment": "entity-events-scenario-environment",
            "given": ["guarded-order-entity-type"],
            "act": { "outputKey": "failure", "try": { "invoke": "guarded-order-entity-type", "operation": "create", "inputMap": { "businessKey": "o-1" } }, "catch": { "set": "#.error" } },
            "assert": [
                { "actual": "#.failure", "expected": { "code": "invalid" } },
                { "actual": "#.calls.default-transactional-outbox.put", "expected": [] }
            ]
        }
    }
]
```

**Groups.** The scenarios of all the files of a run are grouped by their set of packages (the environment's and their own) and their effects, whatever the files or environment elements they come from, and each group boots once with the union of its scenarios' `given`, `stubSets` and environment: a scenario sees the `given` elements of its whole group, not only its own. A scenario that must not see them, or needs other packages, belongs to another group. Groups with different package sets (`A, B` and `A`) don't share anything. Boot dominates the cost of a scenario (about 0.2 s), so one group of 38 scenarios takes 0.6 s.

A package's scenarios are the `.eson` files under its `test/scenarios`. Mocha runs them when its `.mocharc.json` lists the discover module beside the test files, one `describe` per group, one `it` per scenario, a failed assertion shown as a diff:

```json
{ "spec": ["test/**/*.test.js", "../../test-framework/scenarios/src/discover.js"] }
```

`npm run test:quick` treats the `test/scenarios` of a package as one test file. `describeScenarios(title, paths)` of `@business-framework/scenarios/mocha` does the same for other directories, and `bootGroup(library, ids)` and `runScenario(library, id)` of `@business-framework/scenarios` boot a group and run one of its scenarios without Mocha (`groupScenarios(library, ids)` makes the groups).

A scenario doesn't validate when it runs: static analysis is a separate operation that runs before the scenarios. `bpf validate <scenario-directory>` loads the scenario files into the application's registry and checks `act` (operations, references, data flow) like any pipeline, so the fixtures a scenario names in `given`, and the stub sets (its own, or those a listed package ships), are ordinary elements with ids of their own, unique across the application (`guarded-order-entity-type`). A group boots only its packages, stub sets and `given`. The `assert` mappings are analyzed too, against the scope `act` leaves (the `outputKey`s of its top-level nodes, typed any, and `calls`): a misspelled name is `unknown-path`, a misspelled field of the result of a node of `act` is not found yet.
