export const COLLECTION = 'transactional-outbox';
export const COLLECTION_PROPS = {
    indices: [
        { key: { status: 1, processAfterTimestampUTC: 1 } },
        { key: { 'envelope.group': 1, 'envelope.timestampUTC': 1 } },
        { key: { 'envelope.messageId': 1 }, options: { unique: true } }
    ]
};
