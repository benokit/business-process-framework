# server

Starts an application: every installed `@business-framework/*` package that has `elements`, plus the directories given as arguments.

```sh
node bootstrap.js ../../demo        # npm run start-demo
```

1. `boot`: load the core and package elements and the arguments' `.eson` files, then run the `load` hooks.
2. `start`: run the `start` hooks in start order: databases, brokers and search engines first; entry points (HTTP server, endpoints, consumers) and `on-startup` elements last.
3. `SIGTERM` / `SIGINT`: `stop` in reverse order, then exit.

Configuration comes from `app-config` elements and `BPF__<section>__<key>` environment variables, e.g. `BPF__http__port=8080`, `BPF__postgresql__url=…`, `BPF__oauth__issuer=…`.

## on-startup

A kind whose instances are pipelines run once at start, in the last position, with an empty input. Use it for work that needs started resources; it delays the start, so keep it short.

```json
{ "kind": "on-startup", "data": { "log": "\\application started" } }
```

`startServer({ packages?, paths?, elements? })` (from `@business-framework/server`) does the same in a process of your own and returns `stop`.
