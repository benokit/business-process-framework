import { expect } from 'chai';
import { omit } from 'lodash-es';
import { boot, invoke, packageElements, start, stop } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';
import { entityStore } from '../src/store.js';

const entityType = `conformance-${Date.now()}`;

const attempt = async run => {
    try {
        return { value: await run() };
    } catch (error) {
        return { error: error.code };
    }
};

const normalized = ({ value, error }) => error ? { error } : { value: value?.items ? { ...value, items: value.items.map(normalized) } : value?.entityType ? omit(value, ['id', 'timestampUtc']) : value };

const script = async store => {
    const first = await store.create({ entityType, businessKey: 'a', data: { x: 1 } });
    const second = await store.update({ before: first, values: { y: 2 } });
    const steps = [
        { value: first },
        await attempt(() => store.create({ entityType, businessKey: 'a', data: {} })),
        await attempt(() => store.read({ entityType, businessKey: 'a' })),
        await attempt(() => store.read({ entityType, businessKey: 'missing' })),
        await attempt(() => store.read({ entityType, businessKey: 'a', revision: 7 })),
        await attempt(() => store.read({ entityType, businessKey: 'a', revision: 1 })),
        { value: second },
        await attempt(() => store.update({ before: first, values: { z: 3 } })),
        await attempt(() => store.list({ entityType })),
        await attempt(() => store.delete({ before: first })),
        await attempt(() => store.delete({ before: second })),
        await attempt(() => store.read({ entityType, businessKey: 'a' })),
        await attempt(() => store.list({ entityType }))
    ];
    return steps.map(normalized);
};

const inMemory = () => {
    const stubs = entityStore();
    const through = operations => Object.fromEntries(Object.entries(operations).map(([name, run]) => [name, input => run({ input })]));
    return { ...through(stubs['entity-database']), list: through(stubs['list-entities']).run };
};

const inPostgres = () => ({
    create: input => invoke('entity-database', 'create', input),
    read: input => invoke('entity-database', 'read', input),
    update: input => invoke('entity-database', 'update', input),
    delete: input => invoke('entity-database', 'delete', input),
    list: input => invoke('list-entities', 'run', input)
});

describe('the in-memory entity store', function () {
    this.timeout(10000);

    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql'].map(name => packageElements(`@business-framework/${name}`)) });
        await start();
        await migrate();
    });

    after(stop);

    it('answers a script of operations like the entity store of PostgreSQL does', async () => {
        const expected = await script(inPostgres());
        expect(expected.map(({ error }) => error ?? null)).to.deep.equal([null, 'duplicate', null, 'not-found', 'not-found', null, null, 'stale', null, 'stale', null, 'not-found', null]);
        expect(await script(inMemory())).to.deep.equal(expected);
    });
});
