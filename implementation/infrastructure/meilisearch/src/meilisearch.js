import { MeiliSearch } from 'meilisearch';
import { CoreError } from '@business-framework/core';

let client = null;

const meili = () => client ?? (() => {
    throw new CoreError('not-connected', 'meilisearch is not started', {});
})();

const done = async task => {
    await meili().waitForTask(task.taskUid);
    return null;
};

export const connect = ({ input: { url, apiKey } }) => {
    client = new MeiliSearch({ host: url, apiKey });
    return null;
};

export const configureIndex = async ({ input: { indexName, settings } }) => {
    await meili().getIndex(indexName).catch(() => meili().createIndex(indexName, { primaryKey: 'id' }).then(done));
    return settings ? done(await meili().index(indexName).updateSettings(settings)) : null;
};

export const deleteIndex = async ({ input: { indexName } }) => done(await meili().deleteIndex(indexName));

export const insertDocument = async ({ input: { indexName, document } }) => done(await meili().index(indexName).addDocuments([document]));

export const removeDocument = async ({ input: { indexName, id } }) => done(await meili().index(indexName).deleteDocument(id));

export const search = async ({ input: { indexName, query = '', filter, sort, offset, limit } }) => {
    const result = await meili().index(indexName).search(query, { filter, sort, offset, limit });
    return { hits: result.hits, total: result.totalHits ?? result.estimatedTotalHits, offset: result.offset, limit: result.limit };
};
