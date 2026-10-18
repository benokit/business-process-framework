import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const ORDER = `order-${run}`;
const CONTRACT_CLASS = `contract-${run}`;
const CONSTRUCTION = `construction-${run}`;

const fill = (id, target, slot, value, order = {}) => ({ id: `${id}-${run}`, kind: 'slot-fill', data: { target, slot, value, ...order } });

const elements = [
    {
        id: ORDER,
        kind: 'entity-type',
        data: {
            dataSchema: { '!amount': 'number', note: 'string' },
            statesModel: {
                states: { status: ['draft', 'confirmed', 'cancelled'] },
                transitions: {
                    confirm: { from: { status: ['draft'] }, to: { status: 'confirmed' } },
                    cancel: { from: { status: ['draft', 'confirmed'] }, to: { status: 'cancelled' } }
                },
                initialStates: { default: { status: 'draft' }, confirmed: { status: 'confirmed' } }
            }
        }
    },
    fill('positive-amount', ORDER, 'guards', {
        if: { $lte: ['#.input.after.data.amount', 0] },
        then: { throw: { code: 'invalid', message: 'amount must be positive' } }
    }),
    fill('stamp-note', ORDER, 'interceptors', {
        if: '#.input.data',
        then: { inputMap: { $merge: ['#.input', { data: { note: '\\stamped' } }] }, next: true },
        else: { next: true }
    }),
    fill('fail-on-cancelled-amount', ORDER, 'reactions', {
        if: { $eq: ['#.input.after.data.amount', 13] },
        then: { throw: 'unlucky amount' }
    }),
    {
        id: CONTRACT_CLASS,
        kind: 'kind',
        data: {
            extends: 'entity-type',
            defaults: {
                dataSchema: { '!holder': 'string' },
                statesModel: { states: { status: ['draft', 'active'] }, transitions: { activate: { from: { status: ['draft'] }, to: { status: 'active' } } }, initialStates: { default: { status: 'draft' } } }
            }
        }
    },
    { id: CONSTRUCTION, kind: CONTRACT_CLASS, data: { dataSchema: { '!project': 'string' } } },
    fill('contract-key', CONTRACT_CLASS, 'businessKey', { set: { $join: { _strings: ['\\C-', '#.input.data.holder'] } } }),
    fill('construction-key', CONSTRUCTION, 'businessKey', { set: { $join: { _strings: ['\\CON-', '#.input.data.project'] } } })
];

const errorOf = promise => promise.then(() => null, error => error);

describe('entities', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: ['database', 'postgresql', 'transaction', 'entities'].map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('creates with the default initial state and reads back', async () => {
        const created = await invoke(ORDER, 'create', { businessKey: 'o-1', data: { amount: 5 } });
        expect(created).to.include({ entityType: ORDER, businessKey: 'o-1', revision: 1 });
        expect(created.state).to.deep.equal({ dimensions: { status: 'draft' } });
        expect(await invoke(ORDER, 'read', { businessKey: 'o-1' })).to.deep.equal(created);
    });

    it('creates with a named initial state', async () => {
        const created = await invoke(ORDER, 'create', { businessKey: 'o-2', data: { amount: 5 }, initialState: 'confirmed' });
        expect(created.state.dimensions).to.deep.equal({ status: 'confirmed' });
    });

    it('rejects invalid data, a missing businessKey, a duplicate and a missing record', async () => {
        const codes = await Promise.all([
            errorOf(invoke(ORDER, 'create', { businessKey: 'bad', data: { amount: 'x' } })),
            errorOf(invoke(ORDER, 'create', { data: { amount: 1 } })),
            errorOf(invoke(ORDER, 'create', { businessKey: 'o-1', data: { amount: 1 } })),
            errorOf(invoke(ORDER, 'read', { businessKey: 'nothing' }))
        ]);
        expect(codes.map(error => error.code)).to.deep.equal(['invalid', 'invalid', 'conflict', 'not-found']);
    });

    it('runs guards before the write', async () => {
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 'o-neg', data: { amount: -1 } }))).message).to.equal('amount must be positive');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-neg' }))).code).to.equal('not-found');
    });

    it('runs interceptors around the write', async () => {
        expect((await invoke(ORDER, 'create', { businessKey: 'o-3', data: { amount: 5 } })).data.note).to.equal('stamped');
    });

    it('rolls the write back when a reaction fails', async () => {
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 'o-13', data: { amount: 13 } }))).message).to.equal('unlucky amount');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-13' }))).code).to.equal('not-found');
    });

    it('updates with optimistic concurrency and reads past revisions', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-4', data: { amount: 1 } });
        const updated = await invoke(ORDER, 'update', { businessKey: 'o-4', revision: 1, data: { amount: 2 } });
        expect([updated.revision, updated.data.amount]).to.deep.equal([2, 2]);
        expect((await errorOf(invoke(ORDER, 'update', { businessKey: 'o-4', revision: 1, data: { amount: 3 } }))).code).to.equal('conflict');
        expect((await invoke(ORDER, 'read', { businessKey: 'o-4', revision: 1 })).data.amount).to.equal(1);
    });

    it('transitions along the states model', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-5', data: { amount: 1 } });
        const confirmed = await invoke(ORDER, 'transition', { businessKey: 'o-5', transition: 'confirm' });
        expect(confirmed.state).to.deep.equal({ dimensions: { status: 'confirmed' }, fromTransition: 'confirm' });
        expect((await errorOf(invoke(ORDER, 'transition', { businessKey: 'o-5', transition: 'confirm' }))).code).to.equal('conflict');
        expect((await errorOf(invoke(ORDER, 'transition', { businessKey: 'o-5', transition: 'ship' }))).code).to.equal('invalid');
    });

    it('deletes', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-6', data: { amount: 1 } });
        expect((await invoke(ORDER, 'delete', { businessKey: 'o-6' })).businessKey).to.equal('o-6');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-6' }))).code).to.equal('not-found');
    });

    it('lists', async () => {
        const { items, total } = await invoke(ORDER, 'list', { limit: 2 });
        expect(items).to.have.length(2);
        expect(total).to.be.at.least(4);
    });

    it('inherits schema, states model and slots from an entity class, with the most specific business key rule', async () => {
        const created = await invoke(CONSTRUCTION, 'create', { data: { holder: 'Ada', project: 'bridge' } });
        expect(created.businessKey).to.equal('CON-bridge');
        expect((await errorOf(invoke(CONSTRUCTION, 'create', { data: { project: 'no holder' } }))).code).to.equal('invalid');
        expect((await invoke(CONSTRUCTION, 'transition', { businessKey: 'CON-bridge', transition: 'activate' })).state.dimensions.status).to.equal('active');
    });
});
