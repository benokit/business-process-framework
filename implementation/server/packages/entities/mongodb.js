import { MongoClient, ObjectId } from 'mongodb';

const client = new MongoClient('mongodb://admin:password@localhost:27017/admin');
const database = client.db('test-db');

const entitiesCollection = database.collection('entities');

async function createDocument({ data }) {
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

async function readDocument({ id }) {
    const result = await entitiesCollection.findOne({ _id: new ObjectId(id) });
    if (result?._id) {
       return convertDocument(result); 
    } else {
        return null;
    }
}

async function updateDocument({ id, version, data }) {
    const criteria = { _id: new ObjectId(id) };
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

async function deleteDocument({ id, version }) {
    const criteria = { _id: new ObjectId(id) };
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
