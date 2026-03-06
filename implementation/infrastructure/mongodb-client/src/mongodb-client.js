import { MongoClient } from 'mongodb';

const url = process.env.MONGODB_URL ?? 'mongodb://admin:password@localhost:27017/admin';
const dbName = process.env.MONGODB_DB ?? 'test-db';

let client = new MongoClient(url);
let connected = false;

async function connect() {
    if (!connected) {
        client = new MongoClient(url);
        await client.connect();
        connected = true;
    }
}

async function disconnect() {
    if (connected) {
        await client.close();
        connected = false;
    }
}

function getCollection(name) {
    return client.db(dbName).collection(name);
}

function getClient() {
    return client;
}

export { connect, disconnect, getCollection, getClient };
