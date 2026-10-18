import { CoreError } from '@business-framework/core';
import { queryable } from '@business-framework/transaction';

const keyOf = ({ targetEntityId, relationType }) => `${targetEntityId}\0${relationType}`;

const targetId = async (db, { targetEntityType, targetEntityBusinessKey }) => {
    const { rows: [row] } = await db.query('SELECT id FROM entities WHERE entity_type = $1 AND business_key = $2', [targetEntityType, targetEntityBusinessKey]);
    if (!row) throw new CoreError('not-found', `related ${targetEntityType} '${targetEntityBusinessKey}' doesn't exist`, { targetEntityType, targetEntityBusinessKey });
    return row.id;
};

const existingOf = async (db, sourceEntityId) => (await db.query(
    'SELECT target_entity_id AS "targetEntityId", relation_type AS "relationType" FROM entity_relations WHERE source_entity_id = $1',
    [sourceEntityId])).rows;

export const setRelations = async ({ input: { sourceEntityId, relations }, _ctx }) => {
    const db = queryable(_ctx);
    const wanted = await Promise.all(relations.map(async relation => ({ targetEntityId: await targetId(db, relation), relationType: relation.relationType })));
    const existing = await existingOf(db, sourceEntityId);
    const wantedKeys = new Set(wanted.map(keyOf));
    const existingKeys = new Set(existing.map(keyOf));
    await Promise.all(existing.filter(relation => !wantedKeys.has(keyOf(relation))).map(({ targetEntityId, relationType }) => db.query(
        'DELETE FROM entity_relations WHERE source_entity_id = $1 AND target_entity_id = $2 AND relation_type = $3', [sourceEntityId, targetEntityId, relationType])));
    await Promise.all([...new Map(wanted.filter(relation => !existingKeys.has(keyOf(relation))).map(relation => [keyOf(relation), relation])).values()]
        .map(({ targetEntityId, relationType }) => db.query(
            'INSERT INTO entity_relations (source_entity_id, target_entity_id, relation_type) VALUES ($1, $2, $3)', [sourceEntityId, targetEntityId, relationType])));
    return null;
};

export const relationsOf = async ({ input: { sourceEntityId }, _ctx }) => existingOf(queryable(_ctx), sourceEntityId);
