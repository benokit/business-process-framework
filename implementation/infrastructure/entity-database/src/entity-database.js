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
            revision INTEGER NOT NULL DEFAULT 1,
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
            revision INTEGER NOT NULL,
            data_patch JSONB NOT NULL,
            state_patch JSONB NOT NULL,
            timestamp_utc TIMESTAMPTZ NOT NULL,
            PRIMARY KEY (id, revision)
        )
    `);
    await getPool().query(`
        CREATE TABLE IF NOT EXISTS entity_versions (
            id UUID NOT NULL,
            entity_type TEXT NOT NULL,
            version INTEGER NOT NULL,
            data JSONB NOT NULL,
            valid_to TIMESTAMPTZ NOT NULL,
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

async function read({ input: { entityType, id, businessKey, revision } }) {
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
        if (revision === undefined || revision === current.revision) return toRecord(current);
        if (revision < 1 || revision > current.revision) return null;

        const history = await getPool().query(
            `SELECT revision, data_patch, state_patch, timestamp_utc FROM entity_history
             WHERE id = $1 AND revision >= $2 AND revision < $3
             ORDER BY revision DESC`,
            [current.id, revision, current.revision]
        );
        let data = current.data;
        let state = current.state ?? {};
        let timestampUtc = current.timestamp_utc;
        for (const row of history.rows) {
            data = applyPatch(data, row.data_patch).newDocument;
            state = applyPatch(state, row.state_patch).newDocument;
            timestampUtc = row.timestamp_utc;
        }
        return { id: current.id, businessKey: current.business_key, revision, version: current.version, data, state, timestampUtc: toIso(timestampUtc) };
    } catch (err) {
        if (err.code === '22P02') return null; // invalid UUID format
        throw err;
    }
}

async function update({ input: { entityType, id, businessKey, revision, data, state } }) {
    await initSchema();
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        let current;
        if (businessKey) {
            const r = await client.query(
                'SELECT * FROM entities WHERE entity_type = $1 AND business_key = $2 AND revision = $3 FOR UPDATE',
                [entityType, businessKey, revision]
            );
            current = r.rows[0];
        } else {
            const r = await client.query(
                'SELECT * FROM entities WHERE entity_type = $1 AND id = $2 AND revision = $3 FOR UPDATE',
                [entityType, id, revision]
            );
            current = r.rows[0];
        }
        if (!current) throw 'update failed: document not found or revision mismatch';

        const newData = data !== undefined ? data : current.data;
        const newState = state !== undefined ? state : current.state ?? {};
        const dataPatch = data !== undefined ? patchCompare(data, current.data) : [];
        const statePatch = state !== undefined ? patchCompare(state, current.state ?? {}) : [];
        await client.query(
            `INSERT INTO entity_history (id, entity_type, revision, data_patch, state_patch, timestamp_utc) VALUES ($1, $2, $3, $4, $5, $6)`,
            [current.id, current.entity_type, current.revision, JSON.stringify(dataPatch), JSON.stringify(statePatch), current.timestamp_utc]
        );

        const result = await client.query(
            `UPDATE entities SET data = $1, state = $2, revision = revision + 1, timestamp_utc = NOW()
             WHERE id = $3 AND revision = $4
             RETURNING *`,
            [JSON.stringify(newData), JSON.stringify(newState), current.id, current.revision]
        );
        await client.query('COMMIT');
        return toRecord(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function amend({ input: { entityType, id, businessKey, revision, data, validFrom } }) {
    await initSchema();
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        let current;
        if (businessKey) {
            const r = await client.query(
                'SELECT * FROM entities WHERE entity_type = $1 AND business_key = $2 AND revision = $3 FOR UPDATE',
                [entityType, businessKey, revision]
            );
            current = r.rows[0];
        } else {
            const r = await client.query(
                'SELECT * FROM entities WHERE entity_type = $1 AND id = $2 AND revision = $3 FOR UPDATE',
                [entityType, id, revision]
            );
            current = r.rows[0];
        }
        if (!current) throw 'amend failed: document not found or revision mismatch';

        await client.query(
            `INSERT INTO entity_versions (id, entity_type, version, data, valid_to) VALUES ($1, $2, $3, $4, $5)`,
            [current.id, current.entity_type, current.version, JSON.stringify(current.data), validFrom]
        );

        const result = await client.query(
            `UPDATE entities SET data = $1, revision = revision + 1, version = version + 1, timestamp_utc = NOW()
             WHERE id = $2 AND revision = $3
             RETURNING *`,
            [JSON.stringify(data), current.id, current.revision]
        );
        await client.query('COMMIT');
        return toRecord(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function del({ input: { entityType, id, businessKey, revision } }) {
    await initSchema();
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        let result;
        if (businessKey) {
            const sql = revision !== undefined
                ? 'DELETE FROM entities WHERE entity_type = $1 AND business_key = $2 AND revision = $3 RETURNING *'
                : 'DELETE FROM entities WHERE entity_type = $1 AND business_key = $2 RETURNING *';
            const params = revision !== undefined ? [entityType, businessKey, revision] : [entityType, businessKey];
            result = await client.query(sql, params);
        } else {
            const sql = revision !== undefined
                ? 'DELETE FROM entities WHERE entity_type = $1 AND id = $2 AND revision = $3 RETURNING *'
                : 'DELETE FROM entities WHERE entity_type = $1 AND id = $2 RETURNING *';
            const params = revision !== undefined ? [entityType, id, revision] : [entityType, id];
            result = await client.query(sql, params);
        }
        if (!result.rows.length) throw 'delete failed: document not found or revision mismatch';
        await client.query('DELETE FROM entity_history WHERE id = $1', [result.rows[0].id]);
        await client.query('DELETE FROM entity_versions WHERE id = $1', [result.rows[0].id]);
        await client.query('COMMIT');
        return toRecord(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}


function toRecord(row) {
    return { id: row.id, businessKey: row.business_key, revision: row.revision, version: row.version, data: row.data, state: row.state ?? {}, timestampUtc: toIso(row.timestamp_utc) };
}

function toIso(value) {
    return value instanceof Date ? value.toISOString() : value;
}

export { create, read, update, amend, del as delete };
