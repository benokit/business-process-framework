import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const ORDER = `order-${run}`;
const CONTRACT_CLASS = `contract-${run}`;
const CONSTRUCTION = `construction-${run}`;
const CONTRACT_BODY = `contract-body-${run}`;

const fill = (id, target, slot, value, order = {}) => ({ id: `${id}-${run}`, kind: 'slot-fill', data: { target, slot, value, ...order } });

const NOTE = `note-${run}`;
const TAG = `tag-${run}`;
const TAGGED = `tagged-${run}`;
const CONFIGURED = `configured-${run}`;
const NOTED = `noted-${run}`;
const SPECIALISED = `specialised-${run}`;
const MASKED = `masked-${run}`;
const MASKING = `masking-${run}`;
const BODYLESS = `bodyless-${run}`;

const prefixed = id => ({
    id: `${id}-trait`,
    kind: 'kind',
    data: {
        extends: 'entity-trait',
        operations: {
            initialize: { implementation: { set: { $str: ['#.input.configuration.prefix', { $coalesce: ['#.input.input', 'new'] }, { $coalesce: ['#.input.configuration.suffix', ''] }] } } },
            rewrite: { input: '@trait-operation-input', output: '@trait-command', implementation: { set: { command: 'rewrite', value: '#.input.input.value' } } }
        }
    }
});

const TOTAL = `total-${run}`;
const DOUBLE = `double-${run}`;
const DERIVING = `deriving-${run}`;

const derived = (id, compute) => ({
    id: `${id}-trait`,
    kind: 'kind',
    data: {
        extends: 'entity-trait',
        operations: {
            initialize: { implementation: { set: 0 } },
            rewrite: { input: '@trait-operation-input', output: '@trait-command', implementation: { set: { command: 'rewrite', value: '#.input.input.value' } } },
            derive: {
                input: '@trait-derive-input',
                output: '@trait-derivation',
                implementation: [
                    { outputKey: 'computed', set: compute },
                    {
                        if: { $eq: ['#.computed', { $get: { object: '#.input.record.data', path: '#.input.key' } }] },
                        then: { set: null },
                        else: { set: { command: 'derive', value: '#.computed' } }
                    }
                ]
            }
        }
    }
});

const WRITING = `writing-${run}`;
const VERSIONED = `versioned-${run}`;

const elements = [
    {
        id: WRITING,
        kind: 'kind',
        data: {
            extends: 'body-entity-type',
            operations: {
                writeTraits: {
                    input: { '!businessKey': 'string', '!revision': 'number', '!amount': 'number', '!note': 'string' },
                    output: '@entity-record',
                    implementation: {
                        inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision', amount: '#.input.amount', note: '#.input.note' },
                        traitOperations: [
                            { key: 'body', operation: 'put', input: { value: { amount: '#.input.amount' } } },
                            { key: NOTE, operation: 'rewrite', input: { value: '#.input.note' } }
                        ]
                    }
                },
                writeTwice: {
                    input: { '!businessKey': 'string', '!revision': 'number' },
                    output: '@entity-record',
                    implementation: {
                        inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision' },
                        traitOperations: [
                            { key: NOTE, operation: 'rewrite', input: { value: 'a' } },
                            { key: NOTE, operation: 'rewrite', input: { value: 'b' } }
                        ]
                    }
                },
                amend: {
                    input: { '!businessKey': 'string', '!revision': 'number', '!validFrom': 'string', '!body': 'object' },
                    output: '@entity-record',
                    implementation: { inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision', input: { validFrom: '#.input.validFrom', body: '#.input.body' } }, traitOperation: { key: 'body', operation: 'amend' } }
                },
                unamend: {
                    input: { '!businessKey': 'string', '!revision': 'number', '!validFrom': 'string' },
                    output: '@entity-record',
                    implementation: { inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision', input: { validFrom: '#.input.validFrom' } }, traitOperation: { key: 'body', operation: 'remove' } }
                },
                writeTrait: {
                    input: { '!businessKey': 'string', '!revision': 'number', '!key': 'string', '!command': 'string', '!value': '@any' },
                    output: '@entity-record',
                    implementation: { inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision', key: '#.input.key', input: { value: '#.input.value' } }, traitOperation: { key: '#.input.key', operation: 'rewrite' } }
                }
            }
        }
    },
    derived(TOTAL, '#.input.record.data.body.amount'),
    { id: TOTAL, kind: `${TOTAL}-trait`, data: { configuration: {} } },
    derived(DOUBLE, { $multiply: [2, { $get: { object: '#.input.record.data', path: TOTAL } }] }),
    { id: DOUBLE, kind: `${DOUBLE}-trait`, data: { configuration: {} } },
    { id: DERIVING, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, [TOTAL]: { configuration: {} }, [DOUBLE]: { configuration: {} } } } },
    prefixed(NOTE),
    { id: NOTE, kind: `${NOTE}-trait`, data: { configuration: { '!prefix': 'string' } } },
    prefixed(TAG),
    prefixed(MASKED),
    { id: MASKED, kind: `${MASKED}-trait`, data: { configuration: { '!prefix': 'string' }, view: { $if: [{ $eq: ['#.at', 'public'] }, '***', '#.value'] } } },
    { id: MASKING, kind: 'body-entity-type', data: { traits: { body: { configuration: { schema: {} } }, [MASKED]: { configuration: { prefix: 'secret: ' } } } } },
    { id: BODYLESS, kind: 'entity-type', data: { traits: { [NOTE]: { configuration: { prefix: 'plain: ' } } } } },
    { id: TAG, kind: `${TAG}-trait`, data: { cardinality: 'many', configuration: { '!prefix': 'string' } } },
    { id: TAGGED, kind: WRITING, data: { traits: { body: { configuration: { schema: {} } } } } },
    fill('tagged-first', TAGGED, 'traits', { trait: TAG, key: 'first', configuration: { prefix: 'a: ' } }),
    fill('tagged-second', TAGGED, 'traits', { trait: TAG, key: 'second', configuration: { prefix: 'b: ' } }),
    { id: NOTED, kind: 'kind', data: { extends: 'body-entity-type', fixed: { traits: { [NOTE]: { configuration: { prefix: 'class: ' } } } } } },
    { id: CONFIGURED, kind: NOTED, data: { traits: { body: { configuration: { schema: {} } } } } },
    { id: SPECIALISED, kind: NOTED, data: { traits: { body: { configuration: { schema: {} } } } } },
    fill('specialised-note', SPECIALISED, 'traits', { key: NOTE, configuration: { suffix: '!' } }),
    { id: VERSIONED, kind: WRITING, data: { traits: { body: { trait: 'versioned-body', configuration: { schema: { '!owner': 'string', startDate: 'string', '!premium': 'number' }, versioned: { validFrom: '/startDate' } } } } } },
    { id: ORDER, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number', note: 'string' } } } } } },
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
            then: { inputMap: { businessKey: 'o-raced', revision: '#.input.before.revision', value: { amount: 2 } }, invoke: ORDER, operation: 'update' }
        }
    }),
    fill('hide-hidden-order', ORDER, 'guards', {
        if: { $eq: ['#.input.before.businessKey', 'o-hidden'] },
        then: { throw: { code: 'not-found', message: 'hidden' } }
    }, { on: ['read'] }),
    fill('keep-kept-order', ORDER, 'guards', {
        if: { $eq: ['#.input.before.businessKey', 'o-kept'] },
        then: { throw: { code: 'conflict', message: 'kept' } }
    }, { on: ['delete'] }),
    fill('fail-on-unlucky-amount', ORDER, 'reactions', {
        if: { $eq: ['#.input.after.data.body.amount', 13] },
        then: { throw: 'unlucky amount' }
    }),
    { id: CONTRACT_BODY, kind: 'schema', data: { '!holder': 'string' } },
    { id: CONTRACT_CLASS, kind: 'kind', data: { extends: 'body-entity-type' } },
    { id: CONSTRUCTION, kind: CONTRACT_CLASS, data: { traits: { body: { configuration: { schema: { '$data#&': [`@${CONTRACT_BODY}`, { '!project': 'string' }] } } } } } },
    fill('contract-key', CONTRACT_CLASS, 'businessKey', { set: { $str: ['C-', '#.input.traits.body.holder'] } }),
    fill('construction-key', CONSTRUCTION, 'businessKey', { set: { $str: ['CON-', '#.input.traits.body.project'] } }),
    fill('contract-note', CONTRACT_CLASS, 'traits', { trait: NOTE, configuration: { prefix: 'contract: ' } }),
    fill('construction-note', CONSTRUCTION, 'traits', { key: NOTE, configuration: { suffix: ' (construction)' } })
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql'].map(name => `@business-framework/${name}`);

const errorOf = promise => promise.then(() => null, error => error);

describe('entities', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
    });

    after(stop);

    it('validates, apart from the guard that simulates a concurrent writer', () => {
        expect(validate().map(({ code, data }) => [code, data.slot, data.effect])).to.deep.equal([['effect-bound', 'guards', 'write']]);
    });

    it('creates with the body and initial trait values, and reads back', async () => {
        const created = await invoke(ORDER, 'create', { businessKey: 'o-1', traits: { body: { amount: 5 } } });
        expect(created).to.include({ entityType: ORDER, businessKey: 'o-1', revision: 1 });
        expect(created.data).to.deep.equal({ body: { amount: 5, note: 'stamped' }, [NOTE]: 'order: new' });
        expect(await invoke(ORDER, 'read', { businessKey: 'o-1' })).to.deep.equal(created);
    });

    it('creates an entity without a body', async () => {
        const created = await invoke(BODYLESS, 'create', { businessKey: 'b-1' });
        expect(created.data).to.deep.equal({ [NOTE]: 'plain: new' });
        expect(await invoke(BODYLESS, 'read', { businessKey: 'b-1' })).to.deep.equal(created);
    });

    it('shows the value of a trait through its view, given the reader\'s at', async () => {
        await invoke(MASKING, 'create', { businessKey: 'm-1', traits: { body: {} } });
        expect((await invoke(MASKING, 'read', { businessKey: 'm-1' })).data[MASKED]).to.equal('secret: new');
        expect((await invoke(MASKING, 'read', { businessKey: 'm-1', at: 'public' })).data[MASKED]).to.equal('***');
    });

    it('passes trait input on create', async () => {
        const created = await invoke(ORDER, 'create', { businessKey: 'o-2', traits: { body: { amount: 5 }, [NOTE]: 'given' } });
        expect(created.data[NOTE]).to.equal('order: given');
    });

    it('rejects an invalid body, a missing businessKey, a duplicate and a missing record', async () => {
        const codes = await Promise.all([
            errorOf(invoke(ORDER, 'create', { businessKey: 'bad', traits: { body: { amount: 'x' } } })),
            errorOf(invoke(ORDER, 'create', { traits: { body: { amount: 1 } } })),
            errorOf(invoke(ORDER, 'create', { businessKey: 'o-1', traits: { body: { amount: 1 } } })),
            errorOf(invoke(ORDER, 'read', { businessKey: 'nothing' }))
        ]);
        expect(codes.map(error => error.code)).to.deep.equal(['invalid', 'invalid', 'conflict', 'not-found']);
    });

    it('runs guards before the write', async () => {
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 'o-neg', traits: { body: { amount: -1 } } }))).message).to.equal('amount must be positive');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-neg' }))).code).to.equal('not-found');
    });

    it('judges the visibility of a record where it is loaded, before a write computes anything on it', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-hidden', traits: { body: { amount: 1 } } });
        const errors = await Promise.all([
            errorOf(invoke(ORDER, 'read', { businessKey: 'o-hidden' })),
            errorOf(invoke(ORDER, 'update', { businessKey: 'o-hidden', revision: 1, value: { amount: 'x' } })),
            errorOf(invoke(ORDER, 'writeTrait', { businessKey: 'o-hidden', revision: 1, key: 'other', command: 'x', value: {} })),
            errorOf(invoke(ORDER, 'delete', { businessKey: 'o-hidden', revision: 1 }))
        ]);
        expect(errors.map(error => error.code)).to.deep.equal(['not-found', 'not-found', 'not-found', 'not-found']);
    });

    it('runs a guard only on the operations it is on', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-kept', traits: { body: { amount: 1 } } });
        expect((await invoke(ORDER, 'read', { businessKey: 'o-kept' })).businessKey).to.equal('o-kept');
        expect((await invoke(ORDER, 'update', { businessKey: 'o-kept', revision: 1, value: { amount: 2 } })).revision).to.equal(2);
        expect((await errorOf(invoke(ORDER, 'delete', { businessKey: 'o-kept', revision: 2 }))).message).to.equal('kept');
    });

    it('rolls the write back when a reaction fails', async () => {
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 'o-13', traits: { body: { amount: 13 } } }))).message).to.equal('unlucky amount');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-13' }))).code).to.equal('not-found');
    });

    it('updates the body with optimistic concurrency, keeps the traits and reads past revisions', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-4', traits: { body: { amount: 1 } } });
        const updated = await invoke(ORDER, 'update', { businessKey: 'o-4', revision: 1, value: { amount: 2 } });
        expect([updated.revision, updated.data.body, updated.data[NOTE]]).to.deep.equal([2, { amount: 2 }, 'order: new']);
        expect((await errorOf(invoke(ORDER, 'update', { businessKey: 'o-4', revision: 1, value: { amount: 3 } }))).code).to.equal('conflict');
        expect((await invoke(ORDER, 'read', { businessKey: 'o-4', revision: 1 })).data.body.amount).to.equal(1);
    });

    it('writes a declared trait only, keeping the body', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-5', traits: { body: { amount: 1 } } });
        const written = await invoke(ORDER, 'writeTrait', { businessKey: 'o-5', revision: 1, key: NOTE, command: 'rewrite', value: 'changed' });
        expect([written.revision, written.data.body.amount, written.data[NOTE]]).to.deep.equal([2, 1, 'changed']);
        expect((await errorOf(invoke(ORDER, 'writeTrait', { businessKey: 'o-5', revision: 2, key: 'other', command: 'x', value: {} }))).code).to.equal('invalid');
    });

    it('writes several traits in one revision, or none of them', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-multi', traits: { body: { amount: 1 } } });
        const written = await invoke(ORDER, 'writeTraits', { businessKey: 'o-multi', revision: 1, amount: 2, note: 'changed' });
        expect([written.revision, written.data.body.amount, written.data[NOTE]]).to.deep.equal([2, 2, 'changed']);
        expect((await invoke(ORDER, 'read', { businessKey: 'o-multi', revision: 1 })).data[NOTE]).to.equal('order: new');
        expect((await errorOf(invoke(ORDER, 'writeTraits', { businessKey: 'o-multi', revision: 1, amount: 3, note: 'late' }))).code).to.equal('conflict');
        expect((await errorOf(invoke(ORDER, 'writeTraits', { businessKey: 'o-multi', revision: 2, amount: 'x', note: 'refused' }))).code).to.equal('invalid');
        const unchanged = await invoke(ORDER, 'read', { businessKey: 'o-multi' });
        expect([unchanged.revision, unchanged.data.body.amount, unchanged.data[NOTE]]).to.deep.equal([2, 2, 'changed']);
    });

    describe('derived traits', () => {
        it('derive in the order of the traits, each seeing the output of the one before, on create and on a write', async () => {
            const created = await invoke(DERIVING, 'create', { businessKey: 'd-1', traits: { body: { amount: 3 } } });
            expect([created.revision, created.data[TOTAL], created.data[DOUBLE]]).to.deep.equal([1, 3, 6]);
            const updated = await invoke(DERIVING, 'update', { businessKey: 'd-1', revision: 1, value: { amount: 5 } });
            expect([updated.revision, updated.data[TOTAL], updated.data[DOUBLE]]).to.deep.equal([2, 5, 10]);
        });

        it('leave a collision with the command of a caller to the trait', async () => {
            const written = await invoke(DERIVING, 'writeTrait', { businessKey: 'd-1', revision: 2, key: TOTAL, command: 'rewrite', value: 99 });
            expect([written.revision, written.data[TOTAL], written.data[DOUBLE]]).to.deep.equal([3, 5, 10]);
        });

        it('write nothing when nothing is stale', async () => {
            expect((await invoke(DERIVING, 'derive', { businessKey: 'd-1' })).revision).to.equal(3);
        });
    });

    it('refuses a write that changes a trait twice', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-twice', traits: { body: { amount: 1 } } });
        expect((await errorOf(invoke(ORDER, 'writeTwice', { businessKey: 'o-twice', revision: 1 }))).code).to.equal('invalid');
    });

    describe('a versioned body', () => {
        const body = (startDate, premium) => ({ owner: 'Ada', ...(startDate && { startDate }), premium });
        const stored = businessKey => invoke('entity-database', 'read', { entityType: VERSIONED, businessKey });

        it('is stored as versions keyed by its date and read as the last one, or the one valid at a date', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-1', traits: { body: body('2025-01-01', 100) } });
            await invoke(VERSIONED, 'amend', { businessKey: 'v-1', revision: 1, validFrom: '2025-07-01', body: body('2025-07-01', 110) });
            expect(Object.keys((await stored('v-1')).data.body).sort()).to.deep.equal(['2025-01-01', '2025-07-01']);
            expect((await invoke(VERSIONED, 'read', { businessKey: 'v-1' })).data.body).to.deep.equal(body('2025-07-01', 110));
            expect((await invoke(VERSIONED, 'read', { businessKey: 'v-1', at: '2025-03-01' })).data.body).to.deep.equal(body('2025-01-01', 100));
            expect((await invoke(VERSIONED, 'read', { businessKey: 'v-1', revision: 1 })).data.body).to.deep.equal(body('2025-01-01', 100));
            expect((await errorOf(invoke(VERSIONED, 'read', { businessKey: 'v-1', at: '2024-01-01' }))).code).to.equal('not-found');
        });

        it('checks the whole body, including an amended one, against the schema', async () => {
            expect((await errorOf(invoke(VERSIONED, 'create', { businessKey: 'v-2', traits: { body: { owner: 'Ada', premium: 'high' } } }))).code).to.equal('invalid');
            await invoke(VERSIONED, 'create', { businessKey: 'v-2', traits: { body: body('2025-01-01', 100) } });
            expect((await errorOf(invoke(VERSIONED, 'amend', { businessKey: 'v-2', revision: 1, validFrom: '2025-07-01', body: body('2025-07-01', 'high') }))).code).to.equal('invalid');
        });

        it('lets update correct a body of one version, its date included, and refuses it once amended', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-3', traits: { body: body('2025-01-01', 100) } });
            const corrected = await invoke(VERSIONED, 'update', { businessKey: 'v-3', revision: 1, value: body('2025-02-01', 90) });
            expect([corrected.revision, corrected.data.body]).to.deep.equal([2, body('2025-02-01', 90)]);
            expect(Object.keys((await stored('v-3')).data.body)).to.deep.equal(['2025-02-01']);
            await invoke(VERSIONED, 'amend', { businessKey: 'v-3', revision: 2, validFrom: '2025-07-01', body: body('2025-07-01', 95) });
            expect((await errorOf(invoke(VERSIONED, 'update', { businessKey: 'v-3', revision: 3, value: body('2025-02-01', 1) }))).code).to.equal('conflict');
        });

        it('amends from the date of the last version or later, and removes only the last one', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-4', traits: { body: body('2025-01-01', 100) } });
            await invoke(VERSIONED, 'amend', { businessKey: 'v-4', revision: 1, validFrom: '2025-07-01', body: body('2025-07-01', 110) });
            expect((await errorOf(invoke(VERSIONED, 'amend', { businessKey: 'v-4', revision: 2, validFrom: '2025-03-01', body: body('2025-03-01', 110) }))).code).to.equal('conflict');
            const replaced = await invoke(VERSIONED, 'amend', { businessKey: 'v-4', revision: 2, validFrom: '2025-07-01', body: body('2025-07-01', 115) });
            expect([replaced.revision, replaced.data.body]).to.deep.equal([3, body('2025-07-01', 115)]);
            expect(Object.keys((await stored('v-4')).data.body).sort()).to.deep.equal(['2025-01-01', '2025-07-01']);
            expect((await errorOf(invoke(VERSIONED, 'unamend', { businessKey: 'v-4', revision: 3, validFrom: '2025-01-01' }))).code).to.equal('conflict');
            const removed = await invoke(VERSIONED, 'unamend', { businessKey: 'v-4', revision: 3, validFrom: '2025-07-01' });
            expect(removed.data.body).to.deep.equal(body('2025-01-01', 100));
            expect((await errorOf(invoke(VERSIONED, 'unamend', { businessKey: 'v-4', revision: 4, validFrom: '2025-01-01' }))).code).to.equal('invalid');
        });

        it('keys a body without a date by a marker that the first date replaces', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-5', traits: { body: body(undefined, 100) } });
            expect(Object.keys((await stored('v-5')).data.body)).to.deep.equal(['undated']);
            await invoke(VERSIONED, 'update', { businessKey: 'v-5', revision: 1, value: body('2025-01-01', 100) });
            expect(Object.keys((await stored('v-5')).data.body)).to.deep.equal(['2025-01-01']);
        });

        it('returns the body of the last version from every write', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-6', traits: { body: body('2025-01-01', 100) } });
            const amended = await invoke(VERSIONED, 'amend', { businessKey: 'v-6', revision: 1, validFrom: '2025-07-01', body: body('2025-07-01', 110) });
            expect(amended.data.body).to.deep.equal(body('2025-07-01', 110));
        });
    });

    it('holds one trait under several keys', async () => {
        const created = await invoke(TAGGED, 'create', { businessKey: 't-1', traits: { body: {}, first: 'x' } });
        expect([created.data.first, created.data.second]).to.deep.equal(['a: x', 'b: new']);
        const written = await invoke(TAGGED, 'writeTrait', { businessKey: 't-1', revision: 1, key: 'second', command: 'rewrite', value: 'changed' });
        expect([written.data.first, written.data.second]).to.deep.equal(['a: x', 'changed']);
        expect((await errorOf(invoke(TAGGED, 'writeTrait', { businessKey: 't-1', revision: 2, key: TAG, command: 'x', value: {} }))).code).to.equal('invalid');
    });

    it('deletes only at a given revision', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-6', traits: { body: { amount: 1 } } });
        expect((await errorOf(invoke(ORDER, 'delete', { businessKey: 'o-6' }))).code).to.equal('invalid');
        expect((await invoke(ORDER, 'delete', { businessKey: 'o-6', revision: 1 })).businessKey).to.equal('o-6');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-6' }))).code).to.equal('not-found');
    });

    it('refuses a write when the record changed after it was read', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-raced', traits: { body: { amount: 1 } } });
        expect((await errorOf(invoke(ORDER, 'delete', { businessKey: 'o-raced', revision: 1 }))).code).to.equal('conflict');
        const raced = await invoke(ORDER, 'read', { businessKey: 'o-raced' });
        expect([raced.revision, raced.data.body.amount]).to.deep.equal([2, 2]);
    });

    it('lists the records of a type in the store, which no entity type operation exposes', async () => {
        const { items, total } = await invoke('list-entities', 'run', { entityType: ORDER, limit: 2 });
        expect(await errorOf(invoke(ORDER, 'list', { limit: 2 }))).to.not.equal(null);
        expect(items).to.have.length(2);
        expect(total).to.be.at.least(4);
    });

    it('inherits schema, traits and slots from an entity class, with the most specific business key rule', async () => {
        const created = await invoke(CONSTRUCTION, 'create', { traits: { body: { holder: 'Ada', project: 'bridge' } } });
        expect([created.businessKey, created.data[NOTE]]).to.deep.equal(['CON-bridge', 'contract: new (construction)']);
        expect((await errorOf(invoke(CONSTRUCTION, 'create', { traits: { body: { project: 'no holder' } } }))).code).to.equal('invalid');
    });

    it('unites the configuration of a trait from the kind chain, the data and the fills', async () => {
        expect((await invoke(CONFIGURED, 'create', { businessKey: 'c-1', traits: { body: {} } })).data[NOTE]).to.equal('class: new');
        expect((await invoke(SPECIALISED, 'create', { businessKey: 'c-1', traits: { body: {} } })).data[NOTE]).to.equal('class: new!');
    });

    it('reports an exposed trait operation that the entity type cannot run in validate()', async () => {
        const exposing = operation => ({ input: '@entity-revision-input', output: '@entity-record', implementation: { exposes: { key: NOTE, operation } } });
        const broken = [
            { id: `unbodied-${run}`, kind: 'body-entity-type', data: { traits: { [NOTE]: { configuration: { prefix: 'p' } } } } },
            { id: `exposing-${run}`, kind: 'kind', data: { extends: 'entity-type', operations: { vanish: exposing('vanish'), refresh: exposing('derive') } } },
            { id: `exposed-${run}`, kind: `exposing-${run}`, data: { traits: { [NOTE]: { configuration: { prefix: 'p' } } } } }
        ];
        await stop();
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...broken] });
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages).to.include.members([
            `operation 'update' of unbodied-${run} exposes 'put' of 'body', but unbodied-${run} has no trait 'body'`,
            `operation 'vanish' of exposed-${run} exposes 'vanish' of '${NOTE}', but trait '${NOTE}' has no such operation`,
            `operation 'refresh' of exposed-${run} exposes 'derive' of '${NOTE}', which only the framework calls`
        ]);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
    });

    it('reports invalid trait uses in validate()', async () => {
        const broken = [
            { id: `schemaless-${run}`, kind: 'entity-type', data: { traits: { body: {} } } },
            { id: `bad-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, unknown: {}, [NOTE]: { configuration: { prefix: 1 } } } } },
            { id: `dual-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { holder: 'string', '!holder': 'string' } } } } } },
            { id: `conflicting-${run}`, kind: CONTRACT_CLASS, data: { traits: { body: { configuration: { schema: {} } } } } },
            fill('conflicting-note', `conflicting-${run}`, 'traits', { key: NOTE, configuration: { prefix: 'other' } }),
            fill('bad-configuration', `bad-${run}`, 'traits', { trait: NOTE, configuration: { prefix: 1 } }),
            fill('not-a-trait', ORDER, 'traits', { trait: 'postgresql', configuration: {} }),
            fill('repeated-note', CONTRACT_CLASS, 'traits', { trait: NOTE, configuration: { prefix: 'again' } }),
            fill('keyless-tag', `bad-${run}`, 'traits', { trait: TAG, configuration: { prefix: 'p' } }),
            fill('keyed-note', `bad-${run}`, 'traits', { trait: NOTE, key: 'memo', configuration: { prefix: 'p' } }),
            fill('body-tag', `bad-${run}`, 'traits', { trait: TAG, key: 'body', configuration: { prefix: 'p' } }),
            fill('dotted-tag', `bad-${run}`, 'traits', { trait: TAG, key: 'first.one', configuration: { prefix: 'p' } }),
            fill('repeated-tag', TAGGED, 'traits', { trait: TAG, key: 'first', configuration: { prefix: 'again' } }),
            { id: `undated-field-${run}`, kind: 'entity-type', data: { traits: { body: { trait: 'versioned-body', configuration: { schema: { startDate: 'string:^x$' }, versioned: { validFrom: '/startDate' } } } } } },
            { id: `missing-field-${run}`, kind: 'entity-type', data: { traits: { body: { trait: 'versioned-body', configuration: { schema: { startDate: 'string' }, versioned: { validFrom: '/begin' } } } } } }
        ];
        await stop();
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...broken] });
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages).to.include.members([
            `trait '${NOTE}': configuration/prefix must be string`,
            "trait 'body': configuration must have required property 'schema'",
            "'unknown' is not an entity trait",
            `traits.${NOTE} is injected by bad-configuration-${run} and not declared by entity-type`,
            "trait 'body': configuration.schema.holder is both optional and required",
            "'postgresql' is not an entity trait",
            `trait '${NOTE}' is used twice on ${CONTRACT_CLASS}`,
            `trait '${TAG}' needs a key`,
            `trait '${NOTE}' has cardinality one and takes no key`,
            `key 'body' is used by the traits body and ${TAG}`,
            "key 'first.one' is not lowercase letters and digits in segments joined by '-'",
            `trait 'first' is used twice on ${TAGGED}`,
            `undated-field-${run}: the field '/startDate' of the versioned body is no date (a string that matches YYYY-MM-DD)`,
            `missing-field-${run}: the pointer '/begin' of the versioned body is no field of its schema`
        ]);
        expect(messages.some(message => message.includes("can't change the value at 'configuration.prefix'"))).to.equal(true);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
    });
});
