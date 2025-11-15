import { ObjectId } from 'mongodb';
import { database } from 'databases/mongodb.js';

const entitiesCollection = database.collection('entities');

async function createDocument(_, { data }) {
    const dto = {
        version: 1,
        data
    }
    const result = await entitiesCollection.insertOne(dto);
    if (result.acknowledged) {
       return {
            id: result.insertedId.toString()
        };
    } else {
        throw 'create failed'
    }
}

async function readDocument(_, { id }) {
    const result = await entitiesCollection.findOne({ _id: ObjectId.createFromHexString(id) });
    if (result?._id) {
       return convertDocument(result); 
    } else {
        return null;
    }
}

async function updateDocument(_, { id, version, data }) {
    const criteria = { _id: ObjectId.createFromHexString(id) };
    if (version) {
        criteria.version = version;
    } 
    const result = await entitiesCollection.findOneAndUpdate(
        criteria,
        {  
            $inc: { version: 1 },
            $set: { data } 
        },
        { returnDocument: "after" }
    );
    if (result) {
        return convertDocument(result);
    } else {
        throw 'update failed'
    }
}

async function deleteDocument(_, { id, version }) {
    const criteria = { _id: ObjectId.createFromHexString(id) };
    if (version) {
        criteria.version = version;
    } 
    const result = await entitiesCollection.findOneAndDelete(
        criteria
    );
    if (result) {
        return convertDocument(result);
    } else {
        throw 'delete failed'
    }
}

function convertDocument(doc) {
    return {
            id: doc._id.toString(),
            version: doc.version,
            data: doc.data
        };
}

export {
    createDocument as create,
    readDocument as read,
    updateDocument as update,
    deleteDocument as delete
};
