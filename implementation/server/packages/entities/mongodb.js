const { MongoClient, ObjectId } = require('mongodb');

const client = new MongoClient('mongodb://admin:password@localhost:27017/admin');
const database = client.db('test-db');

const entitiesCollection = database.collection('entities');

async function create(request) {
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

async function get(request) {
    const result = await entitiesCollection.findOne({ _id: new ObjectId(request.id) });
    if (result._id) {
       return {
            id: result._id.toString(),
            version: result.version,
            data: result.data
        };
    } else {
        throw 'no entity with the given id'
    }
}

async function update(request) {
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
        return {
            id: result._id.toString(),
            version: result.version,
            data: result.data
        };
    } else {
        throw 'update failed'
    }
}

module.exports = {
    create,
    get,
    update
};
