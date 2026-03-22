import { getPool } from 'postgres-client';

let schemaInitialized = false;

async function initSchema() {
    if (schemaInitialized) return;
    schemaInitialized = true;
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS entities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            collection TEXT NOT NULL,
            business_key TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            data JSONB NOT NULL DEFAULT '{}',
            UNIQUE (collection, business_key)
        )
    `);
}

async function create({ input: { entityType, businessKey, data } }) {
    if (typeof businessKey !== 'string' || businessKey === '') {
        throw 'create failed: businessKey must be a non-empty string';
    }
    await initSchema();
    try {
        const result = await getPool().query(
            `INSERT INTO entities (collection, business_key, data) VALUES ($1, $2, $3) RETURNING *`,
            [entityType, businessKey, JSON.stringify(data)]
        );
        return toRecord(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') throw 'create failed: duplicate businessKey';
        throw err;
    }
}

async function read({ input: { entityType, id, businessKey } }) {
    await initSchema();
    try {
        let result;
        if (businessKey) {
            result = await getPool().query(
                'SELECT * FROM entities WHERE collection = $1 AND business_key = $2',
                [entityType, businessKey]
            );
        } else {
            result = await getPool().query(
                'SELECT * FROM entities WHERE collection = $1 AND id = $2',
                [entityType, id]
            );
        }
        return result.rows.length ? toRecord(result.rows[0]) : null;
    } catch (err) {
        if (err.code === '22P02') return null; // invalid UUID format
        throw err;
    }
}

async function update({ input: { entityType, id, businessKey, version, data } }) {
    await initSchema();
    let result;
    if (businessKey) {
        result = await getPool().query(
            `UPDATE entities SET data = $1, version = version + 1
             WHERE collection = $2 AND business_key = $3 AND version = $4
             RETURNING *`,
            [JSON.stringify(data), entityType, businessKey, version]
        );
    } else {
        result = await getPool().query(
            `UPDATE entities SET data = $1, version = version + 1
             WHERE collection = $2 AND id = $3 AND version = $4
             RETURNING *`,
            [JSON.stringify(data), entityType, id, version]
        );
    }
    if (result.rows.length === 0) throw 'update failed: document not found or version mismatch';
    return toRecord(result.rows[0]);
}

async function del({ input: { entityType, id, businessKey, version } }) {
    await initSchema();
    let result;
    if (businessKey) {
        const sql = version !== undefined
            ? 'DELETE FROM entities WHERE collection = $1 AND business_key = $2 AND version = $3 RETURNING *'
            : 'DELETE FROM entities WHERE collection = $1 AND business_key = $2 RETURNING *';
        const params = version !== undefined ? [entityType, businessKey, version] : [entityType, businessKey];
        result = await getPool().query(sql, params);
    } else {
        const sql = version !== undefined
            ? 'DELETE FROM entities WHERE collection = $1 AND id = $2 AND version = $3 RETURNING *'
            : 'DELETE FROM entities WHERE collection = $1 AND id = $2 RETURNING *';
        const params = version !== undefined ? [entityType, id, version] : [entityType, id];
        result = await getPool().query(sql, params);
    }
    if (result.rows.length === 0) throw 'delete failed: document not found or version mismatch';
    return toRecord(result.rows[0]);
}

async function list({ input: { entityType, filter = {}, sort, limit = 100, skip = 0 } }) {
    await initSchema();
    let sql = 'SELECT * FROM entities WHERE collection = $1 AND data @> $2::jsonb';
    const params = [entityType, JSON.stringify(filter)];
    if (sort) {
        const orderClauses = Object.entries(sort)
            .map(([k, dir]) => {
                const safeKey = k.replace(/[^a-zA-Z0-9_.]/g, '');
                return `data->>'${safeKey}' ${dir >= 0 ? 'ASC' : 'DESC'}`;
            })
            .join(', ');
        sql += ` ORDER BY ${orderClauses}`;
    }
    sql += ` LIMIT $3 OFFSET $4`;
    params.push(limit, skip);
    const result = await getPool().query(sql, params);
    return { records: result.rows.map(toRecord) };
}

function toRecord(row) {
    return { id: row.id, businessKey: row.business_key, version: row.version, data: row.data };
}

export { create, read, update, del as delete, list };
