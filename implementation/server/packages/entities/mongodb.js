const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://admin:password@localhost:27017/admin');
const database = client.db('test-db');

const entitiesCollection = database.collection('entities');

async function create(request) {
    const result = await entitiesCollection.insertOne({data: request.data});
    if (result.acknowledged) {
       return {
            id: result.insertedId.toString()
        };
    } else {
        throw 'create failed'
    }
}

module.exports = {
    create
};
