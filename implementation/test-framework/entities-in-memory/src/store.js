import { CoreError } from '@business-framework/core';
import { pick } from 'lodash-es';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const keyOf = ({ entityType, businessKey }) => `${entityType}\u0000${businessKey}`;

const uuidOf = sequence => `00000000-0000-0000-0000-${String(sequence).padStart(12, '0')}`;

const now = () => new Date().toISOString();

const missing = (key, detail) => new CoreError('not-found', `${key.entityType} '${key.businessKey}' ${detail}`, pick(key, ['entityType', 'businessKey', 'revision']));

const stale = key => new CoreError('stale', `${key.entityType} '${key.businessKey}' is no longer at revision ${key.revision}`, pick(key, ['entityType', 'businessKey', 'revision']));

const duplicate = key => new CoreError('duplicate', `${key.entityType} '${key.businessKey}' already exists`, pick(key, ['entityType', 'businessKey']));

export const entityStore = () => {
    const revisions = new Map();
    let sequence = 0;

    const latest = key => revisions.get(keyOf(key))?.at(-1);

    const atRevision = before => {
        const found = latest(before);
        if (found?.revision !== before.revision) throw stale(before);
        return found;
    };

    const create = ({ input }) => {
        if (revisions.has(keyOf(input))) throw duplicate(input);
        const record = { id: uuidOf(++sequence), ...pick(input, ['entityType', 'businessKey', 'data']), revision: 1, timestampUtc: now() };
        revisions.set(keyOf(input), [record]);
        return record;
    };

    const read = ({ input }) => {
        const history = revisions.get(keyOf(input));
        if (!history) throw missing(input, "doesn't exist");
        const record = input.revision === undefined ? history.at(-1) : history[input.revision - 1];
        if (!record) throw missing(input, `has no revision ${input.revision}`);
        return record;
    };

    const update = ({ input: { before, values } }) => {
        const record = { ...atRevision(before), data: { ...before.data, ...values }, revision: before.revision + 1, timestampUtc: now() };
        revisions.get(keyOf(before)).push(record);
        return record;
    };

    const remove = ({ input: { before } }) => {
        const record = atRevision(before);
        revisions.delete(keyOf(before));
        return record;
    };

    const snapshot = () => new Map([...revisions].map(([key, history]) => [key, [...history]]));

    const restore = saved => {
        revisions.clear();
        saved.forEach((history, key) => revisions.set(key, history));
    };

    const sessions = new Map();
    let sessionSequence = 0;

    const begin = () => {
        const sessionId = ++sessionSequence;
        sessions.set(sessionId, snapshot());
        return { sessionId };
    };

    const commit = ({ input: { sessionId } }) => {
        sessions.delete(sessionId);
        return null;
    };

    const rollback = ({ input: { sessionId } }) => {
        restore(sessions.get(sessionId));
        sessions.delete(sessionId);
        return null;
    };

    const list = ({ input: { entityType, limit = DEFAULT_LIMIT, offset = 0 } }) => {
        const items = [...revisions.values()].map(history => history.at(-1)).filter(record => record.entityType === entityType)
            .sort((a, b) => b.timestampUtc.localeCompare(a.timestampUtc));
        return { items: items.slice(offset, offset + Math.min(limit, MAX_LIMIT)), total: items.length };
    };

    return {
        'entity-database': { create, read, update, delete: remove },
        'list-entities': { run: list },
        transaction: { begin, commit, rollback }
    };
};
