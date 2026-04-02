# messaging-nats

NATS JetStream implementation of [`messaging-broker-interface`](../messaging/README.md#broker-interface-messaging-broker-interface). Requires NATS with JetStream enabled.

## Broker data element

```json
{
    "id": "my-nats-broker",
    "kind": "message-broker",
    "data": { "service": "messaging-nats", "url": "nats://localhost:4222" }
}
```

## Behaviour

| Aspect | Detail |
| --- | --- |
| Transport | NATS JetStream (persistent, at-least-once delivery) |
| Stream | One stream per channel, auto-created on first use |
| `topology: "queue"` | Competing consumers — one delivery per message; all consumers share a durable group keyed on `channelId` |
| `topology: "topic"` | Fan-out — each `message-consumer` has its own durable consumer and receives every message |
| Retry | On handler failure, redelivered up to `consumer.retry.attempts` times with `consumer.retry.backoff` ms delay; terminated after exhaustion (`msg.term()`) |
| Shutdown | Call `disconnect()` to drain all connections |

## `disconnect`

```js
import { disconnect } from 'messaging-nats/nats';
await disconnect();
```

> Start NATS with JetStream: `nats -js` or `docker compose up nats`.
