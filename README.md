# Business Process Framework

A declarative, data-driven framework for defining business logic as structured JSON elements — without writing imperative code for the common case.

## Core idea

Business logic is expressed as a set of **elements**: schemas, data, and services. Each element is a plain JSON object stored in a `.eson` file. A runtime loads these files, validates them, and makes services callable through a simple API.

This means business processes — validation rules, data transformations, service orchestration — live in text files that are easy to read, diff, version, and audit. Logic can be changed without touching application code.

## Building blocks

- **Schema** — declares the shape of data. Used to validate inputs and outputs across service boundaries.
- **Data** — holds configuration, lookup tables, or any static values. Data elements can reference and compose each other.
- **Service** — a callable unit with a typed interface and a declarative implementation. Methods are expressed as pipelines of steps: call another service, apply a transformation, branch on a condition, handle errors.

Service pipelines are pure where possible. Side effects are isolated to explicit `low`-level calls that delegate to host JavaScript functions, keeping the rest of the logic portable and easy to inspect.

The pipeline keyword set is open for extension: packages can register **execution node templates** that add new first-class keywords. For example, the `transaction` package adds `inTransaction`, which wraps a sub-pipeline in a database transaction with a single declarative node — no boilerplate service calls required.

## Potential use cases

- **Workflow automation** — model multi-step business processes (approval flows, document routing, order processing) as composable service pipelines.
- **Configuration-driven APIs** — define backend service behavior in files rather than code; redeploy logic by updating elements without changing the application.
- **Business rules engines** — encode validation, pricing, eligibility, or routing rules as versioned data that non-engineers can review and modify.
- **Service orchestration** — coordinate calls across internal or external services with explicit input/output mapping and error handling at each step.
- **Auditable logic** — because all behavior is declared in plain JSON, the full rule set can be inspected, diffed, and traced without reading source code.

## Getting started

See [implementation/core/README.md](implementation/core/README.md) for the element specification, runtime API, and examples.
