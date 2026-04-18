# Business Process Framework

A declarative, data-driven framework for building backend services as structured JSON elements — without writing imperative code for the common case.

## Core idea

Business logic is expressed as a set of **elements**: schemas, data, and services. Each element is a plain JSON object stored in a `.eson` file. A runtime loads these files, validates them, and makes services callable through a simple API.

Validation rules, data transformations, and service orchestration live in text files that are easy to read, diff, version, and audit. Logic can be updated without touching application code.

## Building blocks

**Schema** declares the shape of data using a compact notation. Schemas validate inputs and outputs across service boundaries and can reference each other.

**Data** holds configuration, lookup tables, or any static values. Data elements compose by reference and deep-merge — no duplication required.

**Service** is a callable unit with a typed interface and a declarative implementation. Methods are expressed as pipelines of steps: call another service, apply a transformation, branch on a condition, handle errors.

Side effects are isolated to explicit `low` nodes that delegate to host JavaScript functions, keeping the rest of the pipeline portable and easy to inspect.

The pipeline keyword set is open for extension: packages register **execution node templates** that add new first-class keywords. For example, the `transaction` package adds `inTransaction`, which wraps a sub-pipeline in a database transaction with a single declarative node.

## Packages

| | |
| --- | --- |
| [Runtime](implementation/runtime/README.md) | Element specification, pipeline keywords, runtime API |
| [Infrastructure](implementation/infrastructure/README.md) | PostgreSQL, transactions, HTTP server, messaging, cache, logging |
| [Framework](implementation/framework/README.md) | Entities, messaging facade, database modelling, security |
