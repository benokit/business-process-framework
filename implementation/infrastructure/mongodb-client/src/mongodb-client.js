import { MongoClient } from 'mongodb';

const url = process.env.MONGODB_URL ?? 'mongodb://admin:password@localhost:27017/admin';
const dbName = process.env.MONGODB_DB ?? 'test-db';

let client = new MongoClient(url);
let connected = false;
const ensuredCollections = new Set();

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
        ensuredCollections.clear();
    }
}

function getCollection(name, props) {
    const col = client.db(dbName).collection(name);
    if (!props) return col;
    return ensureCollectionProps(col, name, props).then(() => col);
}

async function ensureCollectionProps(col, name, props) {
    if (ensuredCollections.has(name)) return;
    ensuredCollections.add(name);
    for (const { key, options } of (props.indices ?? [])) {
        await col.createIndex(key, options ?? {});
    }
}

function getClient() {
    return client;
}

export { connect, disconnect, getCollection, getClient };
