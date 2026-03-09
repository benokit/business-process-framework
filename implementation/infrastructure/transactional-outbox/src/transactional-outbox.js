import { getCollection } from 'mongodb-client';
import { getSession } from 'transaction/mongodb';
import { COLLECTION, COLLECTION_PROPS } from './collection.js';

async function put({ _ctx, input: { destination, envelope } }) {
    const session = _ctx?.transaction?.sessionId != null
        ? getSession(_ctx.transaction.sessionId)
        : undefined;

    const item = {
        destination,
        retryCount: 0,
        status: 0,
        processAfterTimestampUTC: envelope.timestampUTC,
        envelope
    };

    const col = await getCollection(COLLECTION, COLLECTION_PROPS);
    const options = session ? { session } : {};
    await col.insertOne(item, options);

    return { messageId: envelope.messageId };
}

export { put };
