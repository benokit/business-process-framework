import { getCollection } from 'mongodb-client';

const SEQUENCES_COLLECTION = 'sequences';

async function next({ input: { sequence } }) {
    const col = getCollection(SEQUENCES_COLLECTION);
    const result = await col.findOneAndUpdate(
        { _id: sequence },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: 'after' }
    );
    return { value: result.value };
}

export { next };
