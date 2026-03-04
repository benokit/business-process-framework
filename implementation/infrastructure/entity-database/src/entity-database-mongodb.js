import { ObjectId } from 'mongodb';
import { getCollection } from 'mongodb-client';

const indexedCollections = new Set();

async function ensureBusinessKeyIndex(col) {
    if (indexedCollections.has(col.collectionName)) return;
    await col.createIndex({ businessKey: 1 }, { unique: true });
    indexedCollections.add(col.collectionName);
}

async function create({ collection, businessKey, data }) {
    if (typeof businessKey !== 'string' || businessKey === '') {
        throw 'create failed: businessKey must be a non-empty string';
    }
    const col = getCollection(collection);
    await ensureBusinessKeyIndex(col);
    const doc = { businessKey, version: 1, data };
    const result = await col.insertOne(doc);
    if (!result.acknowledged) {
        throw 'create failed';
    }
    return { id: result.insertedId.toString(), businessKey, version: 1, data };
}

async function read({ collection, id, businessKey }) {
    const col = getCollection(collection);
    const criteria = businessKey ? { businessKey } : { _id: ObjectId.createFromHexString(id) };
    const result = await col.findOne(criteria);
    return result ? toRecord(result) : null;
}

async function update({ collection, id, businessKey, version, data }) {
    const col = getCollection(collection);
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

async function del({ collection, id, businessKey, version }) {
    const col = getCollection(collection);
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

async function list({ collection, filter = {}, sort, limit = 100, skip = 0 }) {
    const col = getCollection(collection);
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
