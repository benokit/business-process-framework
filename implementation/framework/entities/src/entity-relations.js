import { connect, getPool } from '@business-framework/postgresql';
import { getClient } from '@business-framework/transaction';

async function db(ctx) {
    if (ctx?.transaction?.sessionId != null) return getClient(ctx.transaction.sessionId);
    await connect();
    return getPool();
}

async function resolveTargetId(dbConn, targetEntityType, targetEntityBusinessKey) {
    const result = await dbConn.query(
        'SELECT id FROM entities WHERE entity_type = $1 AND business_key = $2',
        [targetEntityType, targetEntityBusinessKey]
    );
    if (!result.rows.length) throw `entity-relations: target entity not found: ${targetEntityType}/${targetEntityBusinessKey}`;
    return result.rows[0].id;
}

async function setRelations({ _ctx, input: { sourceEntityId, sourceEntityVersion, relations = [] } }) {
    const conn = await db(_ctx);

    const { rows: existing } = await conn.query(
        'SELECT target_entity_id, relation_type FROM entity_relations WHERE source_entity_id = $1',
        [sourceEntityId]
    );

    const existingSet = new Set(existing.map(r => `${r.target_entity_id}\0${r.relation_type}`));
    const resolvedRelations = await Promise.all(
        relations.map(async r => ({
            targetEntityId: await resolveTargetId(conn, r.targetEntityType, r.targetEntityBusinessKey),
            relationType: r.relationType
        }))
    );
    const newSet = new Set(resolvedRelations.map(r => `${r.targetEntityId}\0${r.relationType}`));

    const toDelete = existing.filter(r => !newSet.has(`${r.target_entity_id}\0${r.relation_type}`));
    const toInsert = resolvedRelations.filter(r => !existingSet.has(`${r.targetEntityId}\0${r.relationType}`));

    for (const r of toDelete) {
        await conn.query(
            'DELETE FROM entity_relations WHERE source_entity_id = $1 AND target_entity_id = $2 AND relation_type = $3',
            [sourceEntityId, r.target_entity_id, r.relation_type]
        );
    }

    for (const r of toInsert) {
        await conn.query(
            'INSERT INTO entity_relations (source_entity_id, source_entity_version, target_entity_id, relation_type) VALUES ($1, $2, $3, $4)',
            [sourceEntityId, sourceEntityVersion, r.targetEntityId, r.relationType]
        );
    }
}

export { setRelations };
