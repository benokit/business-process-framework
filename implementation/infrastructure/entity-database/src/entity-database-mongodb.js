import { ObjectId } from 'mongodb';
import { getCollection } from 'mongodb-client';

const COLLECTION_PROPS = {
    indices: [
        { key: { businessKey: 1 }, options: { unique: true } }
    ]
};

async function create({ input: { collection, businessKey, data } }) {
    if (typeof businessKey !== 'string' || businessKey === '') {
        throw 'create failed: businessKey must be a non-empty string';
    }
    const col = await getCollection(collection, COLLECTION_PROPS);
    const doc = { businessKey, version: 1, data };
    const result = await col.insertOne(doc);
    if (!result.acknowledged) {
        throw 'create failed';
    }
    return { id: result.insertedId.toString(), businessKey, version: 1, data };
}

async function read({ input: { collection, id, businessKey } }) {
    const col = await getCollection(collection, COLLECTION_PROPS);
    const criteria = businessKey ? { businessKey } : { _id: ObjectId.createFromHexString(id) };
    const result = await col.findOne(criteria);
    return result ? toRecord(result) : null;
}

async function update({ input: { collection, id, businessKey, version, data } }) {
    const col = await getCollection(collection, COLLECTION_PROPS);
    const criteria = businessKey ? { businessKey, version } : { _id: ObjectId.createFromHexString(id), version };
    const result = await col.findOneAndUpdate(
        criteria,
        { $inc: { version: 1 }, $set: { data } },
        { returnDocument: 'after' }
    );
    if (!result) {
        throw 'update failed: document not found or version mismatch';
    }
    return toRecord(result);
}

async function del({ input: { collection, id, businessKey, version } }) {
    const col = await getCollection(collection, COLLECTION_PROPS);
    const criteria = businessKey ? { businessKey } : { _id: ObjectId.createFromHexString(id) };
    if (version !== undefined) {
        criteria.version = version;
    }
    const result = await col.findOneAndDelete(criteria);
    if (!result) {
        throw 'delete failed: document not found or version mismatch';
    }
    return toRecord(result);
}

async function list({ input: { collection, filter = {}, sort, limit = 100, skip = 0 } }) {
    const col = await getCollection(collection, COLLECTION_PROPS);
    const mongoFilter = Object.fromEntries(
        Object.entries(filter).map(([k, v]) => [`data.${k}`, v])
    );
    const mongoSort = sort
        ? Object.fromEntries(Object.entries(sort).map(([k, v]) => [`data.${k}`, v]))
        : undefined;
    let cursor = col.find(mongoFilter).skip(skip).limit(limit);
    if (mongoSort) {
        cursor = cursor.sort(mongoSort);
    }
    const results = await cursor.toArray();
    return { records: results.map(toRecord) };
}

function toRecord(doc) {
    return { id: doc._id.toString(), businessKey: doc.businessKey, version: doc.version, data: doc.data };
}

export { create, read, update, del as delete, list };
