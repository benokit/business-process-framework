import { getPool } from 'postgres-client';
import jsonPatchModule from 'fast-json-patch';
const { compare: patchCompare, applyPatch } = jsonPatchModule;

let schemaInitialized = false;

async function initSchema() {
    if (schemaInitialized) return;
    schemaInitialized = true;
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS entities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entity_type TEXT NOT NULL,
            business_key TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            data JSONB NOT NULL DEFAULT '{}',
            state JSONB NOT NULL DEFAULT '{}',
            timestamp_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (entity_type, business_key)
        )
    `);
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS entity_history (
            id UUID NOT NULL,
            entity_type TEXT NOT NULL,
            version INTEGER NOT NULL,
            data_patch JSONB NOT NULL,
            state_patch JSONB NOT NULL,
            timestamp_utc TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id, version)
        )
    `);
}

async function create({ input: { entityType, businessKey, data, state = {} } }) {
    if (typeof businessKey !== 'string' || businessKey === '') {
        throw 'create failed: businessKey must be a non-empty string';
    }
    await initSchema();
    try {
        const result = await getPool().query(
            `INSERT INTO entities (entity_type, business_key, data, state, timestamp_utc) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
            [entityType, businessKey, JSON.stringify(data), JSON.stringify(state)]
        );
        return toRecord(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') throw 'create failed: duplicate businessKey';
        throw err;
    }
}

async function read({ input: { entityType, id, businessKey, version } }) {
    await initSchema();
    try {
        let result;
        if (businessKey) {
            result = await getPool().query(
                'SELECT * FROM entities WHERE entity_type = $1 AND business_key = $2',
                [entityType, businessKey]
            );
        } else {
            result = await getPool().query(
                'SELECT * FROM entities WHERE entity_type = $1 AND id = $2',
                [entityType, id]
            );
        }
        if (!result.rows.length) return null;
        const current = result.rows[0];
        if (version === undefined || version === current.version) return toRecord(current);
        if (version < 1 || version > current.version) return null;

        const history = await getPool().query(
            `SELECT version, data_patch, state_patch, timestamp_utc FROM entity_history
             WHERE id = $1 AND version >= $2 AND version < $3
             ORDER BY version DESC`,
            [current.id, version, current.version]
        );
        let data = current.data;
        let state = current.state ?? {};
        let timestampUtc = current.timestamp_utc;
        for (const row of history.rows) {
            data = applyPatch(data, row.data_patch).newDocument;
            state = applyPatch(state, row.state_patch).newDocument;
            timestampUtc = row.timestamp_utc;
        }
        return { id: current.id, businessKey: current.business_key, version, data, state, timestampUtc: toIso(timestampUtc) };
    } catch (err) {
        if (err.code === '22P02') return null; // invalid UUID format
        throw err;
    }
}

async function update({ input: { entityType, id, businessKey, version, data, state } }) {
    await initSchema();
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        let current;
        if (businessKey) {
            const r = await client.query(
                'SELECT * FROM entities WHERE entity_type = $1 AND business_key = $2 AND version = $3 FOR UPDATE',
                [entityType, businessKey, version]
            );
            current = r.rows[0];
        } else {
            const r = await client.query(
                'SELECT * FROM entities WHERE entity_type = $1 AND id = $2 AND version = $3 FOR UPDATE',
                [entityType, id, version]
            );
            current = r.rows[0];
        }
        if (!current) throw 'update failed: document not found or version mismatch';

        const newData = data !== undefined ? data : current.data;
        const newState = state !== undefined ? state : current.state ?? {};
        const dataPatch = data !== undefined ? patchCompare(data, current.data) : [];
        const statePatch = state !== undefined ? patchCompare(state, current.state ?? {}) : [];
        await client.query(
            `INSERT INTO entity_history (id, entity_type, version, data_patch, state_patch, timestamp_utc) VALUES ($1, $2, $3, $4, $5, $6)`,
            [current.id, current.entity_type, current.version, JSON.stringify(dataPatch), JSON.stringify(statePatch), current.timestamp_utc]
        );

        let result;
        if (businessKey) {
            result = await client.query(
                `UPDATE entities SET data = $1, state = $2, version = version + 1, timestamp_utc = NOW()
                 WHERE entity_type = $3 AND business_key = $4 AND version = $5
                 RETURNING *`,
                [JSON.stringify(newData), JSON.stringify(newState), entityType, businessKey, version]
            );
        } else {
            result = await client.query(
                `UPDATE entities SET data = $1, state = $2, version = version + 1, timestamp_utc = NOW()
                 WHERE entity_type = $3 AND id = $4 AND version = $5
                 RETURNING *`,
                [JSON.stringify(newData), JSON.stringify(newState), entityType, id, version]
            );
        }
        await client.query('COMMIT');
        return toRecord(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function del({ input: { entityType, id, businessKey, version } }) {
    await initSchema();
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        let result;
        if (businessKey) {
            const sql = version !== undefined
                ? 'DELETE FROM entities WHERE entity_type = $1 AND business_key = $2 AND version = $3 RETURNING *'
                : 'DELETE FROM entities WHERE entity_type = $1 AND business_key = $2 RETURNING *';
            const params = version !== undefined ? [entityType, businessKey, version] : [entityType, businessKey];
            result = await client.query(sql, params);
        } else {
            const sql = version !== undefined
                ? 'DELETE FROM entities WHERE entity_type = $1 AND id = $2 AND version = $3 RETURNING *'
                : 'DELETE FROM entities WHERE entity_type = $1 AND id = $2 RETURNING *';
            const params = version !== undefined ? [entityType, id, version] : [entityType, id];
            result = await client.query(sql, params);
        }
        if (!result.rows.length) throw 'delete failed: document not found or version mismatch';
        await client.query('DELETE FROM entity_history WHERE id = $1', [result.rows[0].id]);
        await client.query('COMMIT');
        return toRecord(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function list({ input: { entityType, filter = {}, sort, limit = 100, skip = 0 } }) {
    await initSchema();
    let sql = 'SELECT * FROM entities WHERE entity_type = $1 AND data @> $2::jsonb';
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
    return { id: row.id, businessKey: row.business_key, version: row.version, data: row.data, state: row.state ?? {}, timestampUtc: toIso(row.timestamp_utc) };
}

function toIso(value) {
    return value instanceof Date ? value.toISOString() : value;
}

export { create, read, update, del as delete, list };
