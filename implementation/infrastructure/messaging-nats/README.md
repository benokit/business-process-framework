# messaging-nats

NATS JetStream broker. Kind `nats-broker` (a [`message-broker`](../../framework/messaging/README.md)), instance `nats`, URL from the `nats.url` app config (default `nats://localhost:4222`, `BPF__nats__url`).

- One stream per channel `name`, created on first use.
- `queue` channels share a durable consumer named after the channel (one delivery per message); `topic` channels give each consumer `name` its own durable consumer. Both use a deliver group named like the durable consumer, so instances of an application compete for its messages.
- A `broadcast` consumer gets an ephemeral consumer per subscription that delivers new messages only.
- A handler failure is retried `channel.consumer.retry.attempts` times (default 3), `backoff` ms apart (default 1000); then the message is terminated.
- `stop` drains the connections.
