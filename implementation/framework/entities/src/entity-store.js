import jsonPatch from 'fast-json-patch';
import { CoreError } from '@business-framework/core';
import { queryable, inSession } from '@business-framework/transaction';

const UNIQUE_VIOLATION = '23505';

const toIso = value => value instanceof Date ? value.toISOString() : value;

const toRecord = row => ({
    id: row.id,
    entityType: row.entity_type,
    businessKey: row.business_key,
    revision: row.revision,
    data: row.data,
    timestampUtc: toIso(row.timestamp_utc)
});

const notFound = (entityType, businessKey) => new CoreError('not-found', `${entityType} '${businessKey}' doesn't exist`, { entityType, businessKey });

const revisionMismatch = (entityType, businessKey, revision) =>
    new CoreError('conflict', `${entityType} '${businessKey}' is not at revision ${revision}`, { entityType, businessKey, revision });

const currentRow = async (db, entityType, businessKey, lock = '') => {
    const { rows: [row] } = await db.query(`SELECT * FROM entities WHERE entity_type = $1 AND business_key = $2 ${lock}`, [entityType, businessKey]);
    if (!row) throw notFound(entityType, businessKey);
    return row;
};

const lockedAt = async (db, entityType, businessKey, revision) => {
    const row = await currentRow(db, entityType, businessKey, 'FOR UPDATE');
    if (revision !== undefined && row.revision !== revision) throw revisionMismatch(entityType, businessKey, revision);
    return row;
};

export const create = async ({ input: { entityType, businessKey, data }, _ctx }) => {
    try {
        const { rows: [row] } = await queryable(_ctx).query(
            'INSERT INTO entities (entity_type, business_key, data, timestamp_utc) VALUES ($1, $2, $3, NOW()) RETURNING *',
            [entityType, businessKey, JSON.stringify(data)]);
        return toRecord(row);
    } catch (error) {
        if (error.code === UNIQUE_VIOLATION) throw new CoreError('conflict', `${entityType} '${businessKey}' already exists`, { entityType, businessKey });
        throw error;
    }
};

const historyAfter = async (db, row, revision) => (await db.query(
    'SELECT data_patch, timestamp_utc FROM entity_history WHERE id = $1 AND revision >= $2 AND revision < $3 ORDER BY revision DESC',
    [row.id, revision, row.revision])).rows;

const rewind = (row, history, revision) => history.reduce((record, patch) => ({
    ...record,
    data: jsonPatch.applyPatch(record.data, patch.data_patch, false, false).newDocument,
    timestampUtc: toIso(patch.timestamp_utc)
}), { ...toRecord(row), revision });

export const read = async ({ input: { entityType, businessKey, revision }, _ctx }) => {
    const db = queryable(_ctx);
    const row = await currentRow(db, entityType, businessKey);
    if (revision === undefined || revision === row.revision) return toRecord(row);
    if (revision < 1 || revision > row.revision) throw new CoreError('not-found', `${entityType} '${businessKey}' has no revision ${revision}`, { entityType, businessKey, revision });
    return rewind(row, await historyAfter(db, row, revision), revision);
};

export const update = ({ input: { entityType, businessKey, revision, trait, value }, _ctx }) => inSession(_ctx, async db => {
    const row = await lockedAt(db, entityType, businessKey, revision);
    const data = { ...row.data, [trait]: value };
    await db.query(
        'INSERT INTO entity_history (id, entity_type, revision, data_patch, timestamp_utc) VALUES ($1, $2, $3, $4, $5)',
        [row.id, row.entity_type, row.revision, JSON.stringify(jsonPatch.compare(data, row.data)), row.timestamp_utc]);
    const { rows: [updated] } = await db.query(
        'UPDATE entities SET data = $1, revision = revision + 1, timestamp_utc = NOW() WHERE id = $2 RETURNING *',
        [JSON.stringify(data), row.id]);
    return toRecord(updated);
});

const remove = ({ input: { entityType, businessKey, revision }, _ctx }) => inSession(_ctx, async db => {
    const row = await lockedAt(db, entityType, businessKey, revision);
    await db.query('DELETE FROM entity_history WHERE id = $1', [row.id]);
    await db.query('DELETE FROM entities WHERE id = $1', [row.id]);
    return toRecord(row);
});

export { remove as delete };

export const list = async ({ input: { entityType, limit = 50, offset = 0 }, _ctx }) => {
    const db = queryable(_ctx);
    const [{ rows }, { rows: [{ total }] }] = await Promise.all([
        db.query('SELECT * FROM entities WHERE entity_type = $1 ORDER BY timestamp_utc DESC LIMIT $2 OFFSET $3', [entityType, Math.min(limit, 200), offset]),
        db.query('SELECT COUNT(*)::int AS total FROM entities WHERE entity_type = $1', [entityType])
    ]);
    return { items: rows.map(toRecord), total };
};
