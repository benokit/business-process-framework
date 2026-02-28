# Business framework core

High level programming building blocks are called elements.
Elements are represented as JSON objects, stored in `*.eson` files.

Elements are of three possible types:

- `schema`
- `data`
- `service`

Each element has an `id` and optional `meta`-data that can be used for unique identification and classification.

A `schema` element specifies a shape of data. The supported schema language is the compact schema language: <https://github.com/benokit/compact-json-schema-language>. All schemas are loaded into a global runtime register from which they can be retrieved at any point for data validation. Schemas can be reused using reference by `id`.

A `data` element holds data. A data element can be composed from other data elements using reserved keywords:

- `/ref`: embeds referenced data by id
- `/merge`: merges data in an array
- `/literal`: take data as it is

A `service` element represents a service with an API and corresponding I/O side effect. It consists of

- `interface`
- `implementation`

`interface` specifies API schema: methods and corresponding input/output schemas.
`implementation` is a data object containing implementations of methods. A method implementation is an inlined data element
representing a program using a limited set of programming constructs:

- `[]`: pipeline
- `set`: set invariant context data
- `service`: calls another service
- `low`: executes a function defined within a host framework (i.e. node.js module)
- `return`: maps context to the output
- `forEach`: applies a program on each input item
- `if/else`: branch program
- `switch`: branch program

The service evaluation context is an object that consists of properties `input` and `name`-s of all pipeline items.
The `input` value is an input of a method. Values of `name` properties are outputs of corresponding pipeline items.
If no `return` is specified in a pipeline, the output of the method is the output of the last executed item.

Pure mapping functions could be implemented in lambdaJSON: <https://github.com/benokit/json-programming-language> or in a host programming language using the custom `$low` primitive.
