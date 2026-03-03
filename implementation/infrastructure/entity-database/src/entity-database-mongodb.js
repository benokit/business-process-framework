import { ObjectId } from 'mongodb';
import { getCollection } from 'mongodb-client';

async function create({ collection, data }) {
    const col = getCollection(collection);
    const doc = { version: 1, data };
    const result = await col.insertOne(doc);
    if (!result.acknowledged) {
        throw 'create failed';
    }
    return { id: result.insertedId.toString(), version: 1, data };
}

async function read({ collection, id }) {
    const col = getCollection(collection);
    const result = await col.findOne({ _id: ObjectId.createFromHexString(id) });
    return result ? toRecord(result) : null;
}

async function update({ collection, id, version, data }) {
    const col = getCollection(collection);
    const result = await col.findOneAndUpdate(
        { _id: ObjectId.createFromHexString(id), version },
        { $inc: { version: 1 }, $set: { data } },
        { returnDocument: 'after' }
    );
    if (!result) {
        throw 'update failed: document not found or version mismatch';
    }
    return toRecord(result);
}

async function del({ collection, id, version }) {
    const col = getCollection(collection);
    const criteria = { _id: ObjectId.createFromHexString(id) };
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
    return { id: doc._id.toString(), version: doc.version, data: doc.data };
}

export { create, read, update, del as delete, list };
