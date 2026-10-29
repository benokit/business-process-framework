# entity-events

Publishes an [`entity-event`](elements/entity-events.eson) for every write of every entity type: a `reactions` fill on `entity-type`, so the message goes through the [transactional outbox](../../infrastructure/transactional-outbox/README.md) and is committed with the write.

- Channel `entity-events` (topic, broker `{ "instanceOf": "message-broker" }`, outbox, 5 retries from 500 ms). With several brokers, the application binds `message-broker` or overrides the channel's `broker`.
- Message: `{ eventType: create | update | trait | delete, entityType, id, businessKey, revision, key?, command? }` (`key` and `command` name a [trait](../entities/README.md#traits) write; an update has key `body`); message id `<id>-<revision>-<eventType>`, subject the entity type, so a consumer can [filter](../messaging/README.md) on entity types; group from the entity type's `eventGroup` (see below), correlation from the `trace` context.

## Event group

The outbox delivers the messages of one group in order, one at a time, and a message being retried holds back the rest of its group. Which events share a group is the one-slot `eventGroup` on `entity-type`, declared by this package: a mapping from the record (`#`) to the group. The default fill on `entity-type` is `<entityType>/<businessKey>`: the events of one entity are ordered, and entities don't wait for each other. An entity type or entity class fills the slot to group differently, for example all contracts of one policyholder. A group should stay within one entity type, since some brokers order messages only within a subject:

```json
{ "kind": "slot-fill", "data": { "target": "insurance-contract-type", "slot": "eventGroup", "value": { "$str": ["policyholder/", "#.data.body.policyholder"] } } }
```

