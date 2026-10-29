import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const POLICY = `policy-${run}`;

const fill = (id, value) => ({ id: `${id}-${run}`, kind: 'slot-fill', data: { target: POLICY, slot: 'traits', value } });

const elements = [
    { id: POLICY, kind: 'entity-type', data: { bodySchema: { '!owner': 'string' } } },
    fill('pricing', { trait: 'versionable', key: 'pricing', configuration: { schema: { '!premium': 'number', currency: 'string' } } }),
    fill('terms', { trait: 'versionable', key: 'terms', configuration: { schema: { '!text': 'string' } } })
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-versions'];

const errorOf = promise => promise.then(() => null, error => error);

const first = { pricing: { validFrom: '2025-01-01', data: { premium: 100 } }, terms: { validFrom: '2025-01-01', data: { text: 'a' } } };

const timeline = (operation, input) => invoke('entity-versions', operation, { entityType: POLICY, ...input });

describe('entity-versions', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('starts every timeline with the first version, checked against its schema', async () => {
        const created = await invoke(POLICY, 'create', { businessKey: 'p-1', body: { owner: 'Ada' }, traits: first });
        expect([created.data.pricing, created.data.terms]).to.deep.equal([{ '2025-01-01': { premium: 100 } }, { '2025-01-01': { text: 'a' } }]);
        expect((await errorOf(invoke(POLICY, 'create', { businessKey: 'p-2', body: { owner: 'Ada' }, traits: { pricing: first.pricing } }))).code).to.equal('invalid');
        const wrong = { ...first, pricing: { validFrom: '2025-01-01', data: { premium: 'high' } } };
        expect((await errorOf(invoke(POLICY, 'create', { businessKey: 'p-3', body: { owner: 'Ada' }, traits: wrong }))).code).to.equal('invalid');
    });

    it('splits, resolves and removes one timeline, leaving the others and the body', async () => {
        await invoke(POLICY, 'create', { businessKey: 'p-4', body: { owner: 'Ada' }, traits: first });
        const split = await timeline('put', { businessKey: 'p-4', revision: 1, key: 'pricing', validFrom: '2025-07-01', data: { premium: 110 } });
        expect([split.revision, split.data.body, split.data.terms]).to.deep.equal([2, { owner: 'Ada' }, { '2025-01-01': { text: 'a' } }]);
        expect(await timeline('resolve', { businessKey: 'p-4', key: 'pricing' })).to.deep.equal({ validFrom: '2025-07-01', data: { premium: 110 } });
        expect((await timeline('resolve', { businessKey: 'p-4', key: 'pricing', at: '2025-03-01' })).data).to.deep.equal({ premium: 100 });
        const removed = await timeline('remove', { businessKey: 'p-4', revision: 2, key: 'pricing', validFrom: '2025-07-01' });
        expect(removed.data.pricing).to.deep.equal({ '2025-01-01': { premium: 100 } });
    });

    it('refuses an invalid segment, an unknown key, a stale revision and a removal out of order', async () => {
        await invoke(POLICY, 'create', { businessKey: 'p-5', body: { owner: 'Ada' }, traits: first });
        const refused = await Promise.all([
            timeline('put', { businessKey: 'p-5', revision: 1, key: 'pricing', validFrom: '2025-07-01', data: { premium: 'high' } }),
            timeline('put', { businessKey: 'p-5', revision: 1, key: 'body', validFrom: '2025-07-01', data: { owner: 'Bob' } }),
            timeline('put', { businessKey: 'p-5', revision: 1, key: 'pricing', validFrom: '2024-07-01', data: { premium: 90 } })
        ].map(errorOf));
        expect(refused.map(error => error.code)).to.deep.equal(['invalid', 'invalid', 'invalid']);
        await timeline('put', { businessKey: 'p-5', revision: 1, key: 'pricing', validFrom: '2025-07-01', data: { premium: 110 } });
        await timeline('put', { businessKey: 'p-5', revision: 2, key: 'pricing', validFrom: '2026-01-01', data: { premium: 120 } });
        expect((await errorOf(timeline('put', { businessKey: 'p-5', revision: 2, key: 'pricing', validFrom: '2026-06-01', data: { premium: 1 } }))).code).to.equal('conflict');
        expect((await errorOf(timeline('remove', { businessKey: 'p-5', revision: 3, key: 'pricing', validFrom: '2025-07-01' }))).code).to.equal('conflict');
    });

    it('reads a past revision of a timeline', async () => {
        await invoke(POLICY, 'create', { businessKey: 'p-6', body: { owner: 'Ada' }, traits: first });
        await timeline('put', { businessKey: 'p-6', revision: 1, key: 'pricing', validFrom: '2025-07-01', data: { premium: 110 } });
        expect((await invoke(POLICY, 'read', { businessKey: 'p-6', revision: 1 })).data.pricing).to.deep.equal({ '2025-01-01': { premium: 100 } });
    });
});
