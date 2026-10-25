import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const ORDER = `order-${run}`;
const CONTRACT_CLASS = `contract-${run}`;
const CONSTRUCTION = `construction-${run}`;

const fill = (id, target, slot, value, order = {}) => ({ id: `${id}-${run}`, kind: 'slot-fill', data: { target, slot, value, ...order } });

const NOTE = `note-${run}`;

const elements = [
    { id: `${NOTE}-trait`, kind: 'kind', data: { extends: 'entity-trait', operations: { initialize: { implementation: { set: { $str: ['#.input.configuration.prefix', { $coalesce: ['#.input.input', 'new'] }] } } } } } },
    { id: NOTE, kind: `${NOTE}-trait`, data: { configuration: { '!prefix': 'string' } } },
    { id: ORDER, kind: 'entity-type', data: { bodySchema: { '!amount': 'number', note: 'string' } } },
    fill('order-note', ORDER, 'traits', { trait: NOTE, configuration: { prefix: 'order: ' } }),
    fill('positive-amount', ORDER, 'guards', {
        if: { $and: [{ $eq: ['#.input.operation', 'create'] }, { $lte: ['#.input.after.data.body.amount', 0] }] },
        then: { throw: { code: 'invalid', message: 'amount must be positive' } }
    }),
    fill('stamp-note', ORDER, 'interceptors', {
        if: { $eq: ['#.input.operation', 'create'] },
        then: { inputMap: { $merge: ['#.input', { input: { data: { body: { note: 'stamped' } } } }] }, next: true },
        else: { next: true }
    }),
    fill('change-operation', ORDER, 'interceptors', { inputMap: { $merge: ['#.input', { operation: 'delete' }] }, next: true }, { position: 'last' }),
    fill('change-concurrently', ORDER, 'guards', {
        if: { $eq: ['#.input.before.businessKey', 'o-raced'] },
        then: {
            if: { $eq: ['#.input.operation', 'delete'] },
            then: { inputMap: { businessKey: 'o-raced', revision: '#.input.before.revision', body: { amount: 2 } }, invoke: ORDER, operation: 'update' }
        }
    }),
    fill('fail-on-unlucky-amount', ORDER, 'reactions', {
        if: { $eq: ['#.input.after.data.body.amount', 13] },
        then: { throw: 'unlucky amount' }
    }),
    { id: CONTRACT_CLASS, kind: 'kind', data: { extends: 'entity-type', defaults: { bodySchema: { '!holder': 'string' } } } },
    { id: CONSTRUCTION, kind: CONTRACT_CLASS, data: { bodySchema: { '!project': 'string' } } },
    fill('contract-key', CONTRACT_CLASS, 'businessKey', { set: { $str: ['C-', '#.input.body.holder'] } }),
    fill('construction-key', CONSTRUCTION, 'businessKey', { set: { $str: ['CON-', '#.input.body.project'] } }),
    fill('contract-note', CONTRACT_CLASS, 'traits', { trait: NOTE, configuration: { prefix: 'contract: ' } }),
    fill('construction-note', CONSTRUCTION, 'traits', { trait: NOTE, configuration: { prefix: 'construction: ' } })
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql'].map(name => `@business-framework/${name}`);

const errorOf = promise => promise.then(() => null, error => error);

describe('entities', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
    });

    after(stop);

    it('validates, apart from the guard that simulates a concurrent writer', () => {
        expect(validate().map(({ code, data }) => [code, data.slot, data.effect])).to.deep.equal([['effect-bound', 'guards', 'write']]);
    });

    it('creates with the body and initial trait values, and reads back', async () => {
        const created = await invoke(ORDER, 'create', { businessKey: 'o-1', body: { amount: 5 } });
        expect(created).to.include({ entityType: ORDER, businessKey: 'o-1', revision: 1 });
        expect(created.data).to.deep.equal({ body: { amount: 5, note: 'stamped' }, [NOTE]: 'order: new' });
        expect(await invoke(ORDER, 'read', { businessKey: 'o-1' })).to.deep.equal(created);
    });

    it('passes trait input on create', async () => {
        const created = await invoke(ORDER, 'create', { businessKey: 'o-2', body: { amount: 5 }, traits: { [NOTE]: 'given' } });
        expect(created.data[NOTE]).to.equal('order: given');
    });

    it('rejects an invalid body, a missing businessKey, a duplicate and a missing record', async () => {
        const codes = await Promise.all([
            errorOf(invoke(ORDER, 'create', { businessKey: 'bad', body: { amount: 'x' } })),
            errorOf(invoke(ORDER, 'create', { body: { amount: 1 } })),
            errorOf(invoke(ORDER, 'create', { businessKey: 'o-1', body: { amount: 1 } })),
            errorOf(invoke(ORDER, 'read', { businessKey: 'nothing' }))
        ]);
        expect(codes.map(error => error.code)).to.deep.equal(['invalid', 'invalid', 'conflict', 'not-found']);
    });

    it('runs guards before the write', async () => {
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 'o-neg', body: { amount: -1 } }))).message).to.equal('amount must be positive');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-neg' }))).code).to.equal('not-found');
    });

    it('rolls the write back when a reaction fails', async () => {
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 'o-13', body: { amount: 13 } }))).message).to.equal('unlucky amount');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-13' }))).code).to.equal('not-found');
    });

    it('updates the body with optimistic concurrency, keeps the traits and reads past revisions', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-4', body: { amount: 1 } });
        const updated = await invoke(ORDER, 'update', { businessKey: 'o-4', revision: 1, body: { amount: 2 } });
        expect([updated.revision, updated.data.body, updated.data[NOTE]]).to.deep.equal([2, { amount: 2 }, 'order: new']);
        expect((await errorOf(invoke(ORDER, 'update', { businessKey: 'o-4', revision: 1, body: { amount: 3 } }))).code).to.equal('conflict');
        expect((await invoke(ORDER, 'read', { businessKey: 'o-4', revision: 1 })).data.body.amount).to.equal(1);
    });

    it('writes a declared trait only, keeping the body', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-5', body: { amount: 1 } });
        const written = await invoke(ORDER, 'writeTrait', { businessKey: 'o-5', revision: 1, trait: NOTE, command: 'rewrite', value: 'changed' });
        expect([written.revision, written.data.body.amount, written.data[NOTE]]).to.deep.equal([2, 1, 'changed']);
        const undeclared = await Promise.all(['body', 'other'].map(trait => errorOf(invoke(ORDER, 'writeTrait', { businessKey: 'o-5', revision: 2, trait, command: 'x', value: {} }))));
        expect(undeclared.map(error => error.code)).to.deep.equal(['invalid', 'invalid']);
    });

    it('deletes only at a given revision', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-6', body: { amount: 1 } });
        expect((await errorOf(invoke(ORDER, 'delete', { businessKey: 'o-6' }))).code).to.equal('invalid');
        expect((await invoke(ORDER, 'delete', { businessKey: 'o-6', revision: 1 })).businessKey).to.equal('o-6');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-6' }))).code).to.equal('not-found');
    });

    it('refuses a write when the record changed after it was read', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-raced', body: { amount: 1 } });
        expect((await errorOf(invoke(ORDER, 'delete', { businessKey: 'o-raced', revision: 1 }))).code).to.equal('conflict');
        const raced = await invoke(ORDER, 'read', { businessKey: 'o-raced' });
        expect([raced.revision, raced.data.body.amount]).to.deep.equal([2, 2]);
    });

    it('lists', async () => {
        const { items, total } = await invoke(ORDER, 'list', { limit: 2 });
        expect(items).to.have.length(2);
        expect(total).to.be.at.least(4);
    });

    it('inherits schema, traits and slots from an entity class, with the most specific business key rule', async () => {
        const created = await invoke(CONSTRUCTION, 'create', { body: { holder: 'Ada', project: 'bridge' } });
        expect([created.businessKey, created.data[NOTE]]).to.deep.equal(['CON-bridge', 'construction: new']);
        expect((await errorOf(invoke(CONSTRUCTION, 'create', { body: { project: 'no holder' } }))).code).to.equal('invalid');
    });

    it('reports invalid trait uses in validate()', async () => {
        const broken = [
            { id: `bad-${run}`, kind: 'entity-type', data: { bodySchema: {} } },
            fill('bad-configuration', `bad-${run}`, 'traits', { trait: NOTE, configuration: { prefix: 1 } }),
            fill('not-a-trait', ORDER, 'traits', { trait: 'postgresql', configuration: {} }),
            fill('repeated-note', CONTRACT_CLASS, 'traits', { trait: NOTE, configuration: { prefix: 'again' } })
        ];
        await stop();
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...broken] });
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages).to.include.members([
            `trait '${NOTE}': configuration/prefix must be string`,
            "'postgresql' is not an entity trait",
            `trait '${NOTE}' is used twice on ${CONTRACT_CLASS}`
        ]);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
    });
});
