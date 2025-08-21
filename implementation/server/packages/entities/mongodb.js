const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://admin:password@localhost:27017/admin');
const database = client.db('test-db');

const entitiesCollection = database.collection('entities');

async function createDocument(request) {
    const dto = {
        version: 1,
        data: request.data
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

async function readDocument(request) {
    const result = await entitiesCollection.findOne({ _id: new ObjectId(request.id) });
    if (result?._id) {
       return convertDocument(result); 
    } else {
        return null;
    }
}

async function updateDocument(request) {
    const criteria = { _id: new ObjectId(request.id) };
    if (request.version) {
        criteria.version = request.version;
    } 
    const result = await entitiesCollection.findOneAndUpdate(
        criteria,
        {  
            $inc: { version: 1 },
            $set: { data: request.data  } 
        },
        { returnDocument: "after" }
    );
    if (result) {
        return convertDocument(result);
    } else {
        throw 'update failed'
    }
}

async function deleteDocument(request) {
    const criteria = { _id: new ObjectId(request.id) };
    if (request.version) {
        criteria.version = request.version;
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

module.exports = {
    createDocument,
    readDocument,
    updateDocument,
    deleteDocument
};
