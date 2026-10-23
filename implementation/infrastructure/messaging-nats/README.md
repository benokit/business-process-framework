# messaging-nats

NATS JetStream broker. Kind `nats-broker` (a [`message-broker`](../../framework/messaging/README.md)), instance `nats`, URL from the `nats.url` app config (default `nats://localhost:4222`, `BPF__nats__url`).

- One stream per channel `name`, created on first use with `interest` retention: a message is kept until every consumer that existed when it was published has acknowledged or terminated it, then removed. There is no age limit, so a durable consumer that is offline gets every message when it returns, and a durable that is no longer used keeps its messages until an administrator removes it. A stream with another retention fails with `stream-retention` (NATS can't change it; recreate the stream).
- `queue` channels share a durable consumer named after the channel (one delivery per message); `topic` channels give each consumer `name` its own durable consumer. Both use a deliver group named like the durable consumer, so instances of an application compete for its messages.
- A `broadcast` consumer gets an ephemeral consumer per subscription that delivers new messages only.
- A handler failure is retried `channel.consumer.retry.attempts` times (default 3), `backoff` ms apart (default 1000); then the message is terminated.
- A connection reconnects without limit while the server is down; a connection that fails or closes is opened again on next use. `publish` raises `unavailable` when it can't reach the server or gets no acknowledgement in time (after 5 s).
- `stop` drains the connections.
