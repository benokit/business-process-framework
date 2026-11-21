# Test framework

Tests as elements. Used by the tests of the other packages only; nothing in an application depends on it.

| Package | Description |
| --- | --- |
| [scenarios](scenarios/README.md) | `scenario` and `stub-set` kinds: `given` fixtures, `act` and `assert`, stubs and fakes; runner and Mocha adapter |
| [entities-in-memory](entities-in-memory/README.md) | A stateful fake of the entity store for scenarios, checked against PostgreSQL |
