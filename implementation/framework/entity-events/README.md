# entity-events

Publishes an [`entity-event`](elements/entity-events.eson) for every write of every entity type: a `reactions` fill on `entity-type`, so the message goes through the [transactional outbox](../../infrastructure/transactional-outbox/README.md) and is committed with the write.

- Channel `entity-events` (topic, broker `{ "instanceOf": "message-broker" }`, outbox, 5 retries from 500 ms). With several brokers, the application binds `message-broker` or overrides the channel's `broker`.
- Message: `{ eventType: create | update | trait | delete, entityType, id, businessKey, revision, trait?, command? }` (`trait` and `command` name a [trait](../entities/README.md#traits) write; an update has trait `body`); message id `<id>-<revision>-<eventType>`, group = business key (events of one entity are delivered in order), correlation from the `trace` context.
