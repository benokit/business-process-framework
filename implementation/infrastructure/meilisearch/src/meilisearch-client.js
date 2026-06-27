import { MeiliSearch } from 'meilisearch';
import { getAppConfig } from '@business-framework/runtime/app-config';

let client = null;

function getClient() {
    if (!client) {
        const config = getAppConfig();
        client = new MeiliSearch({
            host: config.meilisearchUrl ?? 'http://localhost:7700',
            apiKey: config.meilisearchApiKey ?? ''
        });
    }
    return client;
}

async function configureIndex({ input: { indexName, configuration = {} } }) {
    const ms = getClient();
    try {
        await ms.getIndex(indexName);
    } catch {
        const task = await ms.createIndex(indexName, { primaryKey: configuration.primaryKey ?? 'id' });
        await ms.waitForTask(task.taskUid);
    }
    if (configuration.settings) {
        const index = ms.index(indexName);
        const task = await index.updateSettings(configuration.settings);
        await ms.waitForTask(task.taskUid);
    }
    return { indexName };
}

async function deleteIndex({ input: { indexName } }) {
    const ms = getClient();
    try {
        const task = await ms.deleteIndex(indexName);
        await ms.waitForTask(task.taskUid);
    } catch {
        // index may not exist
    }
    return {};
}

async function insertDocument({ input: { indexName, document } }) {
    const ms = getClient();
    const index = ms.index(indexName);
    const task = await index.addDocuments([document]);
    await ms.waitForTask(task.taskUid);
    return { id: document.id };
}

async function removeDocument({ input: { indexName, document } }) {
    const ms = getClient();
    const index = ms.index(indexName);
    const task = await index.deleteDocument(document.id);
    await ms.waitForTask(task.taskUid);
    return {};
}

async function search({ input: { indexName, query } }) {
    const ms = getClient();
    const index = ms.index(indexName);
    const { q, ...options } = query;
    return await index.search(q ?? '', options);
}

export { configureIndex, deleteIndex, insertDocument, removeDocument, search };
