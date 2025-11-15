import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://admin:password@localhost:27017/admin');
const database = client.db('test-db');

async function connect() {
    await client.connect();
}

export {
    database,
    connect
};