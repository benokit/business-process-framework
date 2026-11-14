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
const CONFIGURED = `configured-${run}`;
const NOTED = `noted-${run}`;
const SPECIALISED = `specialised-${run}`;
const MASKED = `masked-${run}`;
const MASKING = `masking-${run}`;
const BODYLESS = `bodyless-${run}`;
const VETO = `veto-${run}`;
const HOOKED = `hooked-${run}`;

const prefixed = id => ({
    id: `${id}-trait`,
    kind: 'kind',
    data: {
        extends: 'valued-entity-trait',
        operations: {
            initialize: { implementation: { set: { $str: ['#.input.configuration.prefix', { $coalesce: ['#.input.input', 'new'] }, { $coalesce: ['#.input.configuration.suffix', ''] }] } } },
            rewrite: { input: '@trait-operation-input', output: '@trait-command', implementation: { set: { command: 'rewrite', value: '#.input.input.value' } } }
        }
    }
});

const TOTAL = `total-${run}`;
const DOUBLE = `double-${run}`;
const DERIVING = `deriving-${run}`;
const REVERSED = `reversed-${run}`;
const ADDED = `added-${run}`;
const ADDING = `adding-${run}`;
const COUNTING = `counting-${run}`;
const CHAINING = `chaining-${run}`;
const RESULT_GUARDED = `result-guarded-${run}`;
const PREVIEWED = `previewed-${run}`;
const PREVIEWING = `previewing-${run}`;
const RUNAWAY = `runaway-${run}`;
const UNDECLARED = `undeclared-${run}`;

const derived = id => ({
    id: `${id}-trait`,
    kind: 'kind',
    data: {
        extends: 'valued-entity-trait',
        operations: {
            initialize: { implementation: { set: 0 } },
            rewrite: { input: '@trait-operation-input', output: '@trait-command', implementation: { set: { command: 'rewrite', value: '#.input.input.value' } } }
        }
    }
});

const derivation = compute => [
    { outputKey: 'computed', set: compute },
    {
        if: { $eq: ['#.computed', { $get: { object: '#.input.record.data', path: '#.input.key' } }] },
        then: { set: [] },
        else: { set: [{ key: '#.input.key', operation: 'rewrite', input: { value: '#.computed' } }] }
    }
];

const WRITING = `writing-${run}`;
const VERSIONED = `versioned-${run}`;

const elements = [
    {
        id: WRITING,
        kind: 'kind',
        data: {
            extends: 'entity-type',
            operations: {
                writeTraits: {
                    input: { '!businessKey': 'string', '!revision': 'number', '!amount': 'number', '!note': 'string' },
                    output: '@entity-record',
                    implementation: {
                        inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision', amount: '#.input.amount', note: '#.input.note' },
                        traitOperations: [
                            { key: 'body', operation: 'update', input: { value: { amount: '#.input.amount' } } },
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
                    input: { '!businessKey': 'string', '!revision': 'number', '!validFrom': 'string', '!ref': 'string', '!body': 'object' },
                    output: '@entity-record',
                    implementation: { inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision', input: { validFrom: '#.input.validFrom', ref: '#.input.ref', body: '#.input.body' } }, traitOperation: { key: 'body', operation: 'amend' } }
                },
                unamend: {
                    input: { '!businessKey': 'string', '!revision': 'number', '!validFrom': 'string', '!ref': 'string' },
                    output: '@entity-record',
                    implementation: { inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision', input: { validFrom: '#.input.validFrom', ref: '#.input.ref' } }, traitOperation: { key: 'body', operation: 'remove' } }
                },
                writeTrait: {
                    input: { '!businessKey': 'string', '!revision': 'number', '!key': 'string', '!command': 'string', '!value': '@any' },
                    output: '@entity-record',
                    implementation: { inputMap: { businessKey: '#.input.businessKey', revision: '#.input.revision', key: '#.input.key', input: { value: '#.input.value' } }, traitOperation: { key: '#.input.key', operation: 'rewrite' } }
                }
            }
        }
    },
    derived(TOTAL),
    { id: TOTAL, kind: `${TOTAL}-trait`, data: { configuration: {}, derive: derivation('#.input.record.data.body.amount') } },
    derived(DOUBLE),
    { id: DOUBLE, kind: `${DOUBLE}-trait`, data: { configuration: {}, derive: derivation({ $multiply: [2, { $get: { object: '#.input.record.data', path: TOTAL } }] }) } },
    { id: DERIVING, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, [TOTAL]: { configuration: {}, dependsOn: ['body', TOTAL] }, [DOUBLE]: { configuration: {}, dependsOn: [TOTAL] } } } },
    { id: REVERSED, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, [DOUBLE]: { configuration: {}, dependsOn: [TOTAL] }, [TOTAL]: { configuration: {}, dependsOn: ['body', TOTAL] } } } },
    {
        id: `${ADDED}-trait`,
        kind: 'kind',
        data: {
            extends: 'valued-entity-trait',
            operations: {
                initialize: { implementation: { set: 0 } },
                add: { input: '@trait-operation-input', output: '@trait-command', implementation: { set: { command: 'add', value: { $sum: ['#.input.value', '#.input.input'] } } } }
            }
        }
    },
    { id: ADDED, kind: `${ADDED}-trait`, data: { configuration: {} } },
    {
        id: `${ADDING}-trait`,
        kind: 'kind',
        data: { extends: 'valued-entity-trait', operations: { initialize: { implementation: { set: 0 } } } }
    },
    {
        id: ADDING,
        kind: `${ADDING}-trait`,
        data: {
            configuration: {},
            derive: {
                if: { $eq: [{ $get: { object: '#.input.record.data', path: ADDED } }, 0] },
                then: { set: [{ key: ADDED, operation: 'add', input: 1 }, { key: ADDED, operation: 'add', input: 2 }] },
                else: { set: [] }
            }
        }
    },
    { id: RESULT_GUARDED, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, [TOTAL]: { configuration: {}, dependsOn: ['body', TOTAL] }, [DOUBLE]: { configuration: {}, dependsOn: [TOTAL] } } } },
    {
        id: `${PREVIEWING}-trait`,
        kind: 'kind',
        data: {
            extends: 'entity-trait',
            operations: {
                preview: {
                    public: true,
                    input: { '$data#&': ['@trait-process-input', { '!input': { '!amount': 'number' } }] },
                    output: '@trait-plan',
                    implementation: { set: { operations: [{ key: 'body', operation: 'update', input: { value: { amount: '#.input.input.amount' } } }], commit: false } }
                }
            }
        }
    },
    { id: PREVIEWING, kind: `${PREVIEWING}-trait`, data: { configuration: {} } },
    { id: PREVIEWED, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, [TOTAL]: { configuration: {}, dependsOn: ['body', TOTAL] }, [DOUBLE]: { configuration: {}, dependsOn: [TOTAL] }, [PREVIEWING]: { configuration: {} } } } },
    { id: CHAINING, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, [ADDED]: { configuration: {} }, [ADDING]: { configuration: {}, dependsOn: [ADDED] } } } },
    derived(COUNTING),
    {
        id: COUNTING,
        kind: `${COUNTING}-trait`,
        data: { configuration: {}, derive: { set: [{ key: '#.input.key', operation: 'rewrite', input: { value: { $sum: [{ $get: { object: '#.input.record.data', path: '#.input.key' } }, 1] } } }] } }
    },
    { id: UNDECLARED, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, [DOUBLE]: { configuration: {} }, [TOTAL]: { configuration: {}, dependsOn: ['body'] } } } },
    { id: RUNAWAY, kind: WRITING, data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, [COUNTING]: { configuration: {}, dependsOn: [COUNTING] } } } },
    prefixed(NOTE),
    { id: NOTE, kind: `${NOTE}-trait`, data: { configuration: { '!prefix': 'string' } } },
    prefixed(MASKED),
    { id: MASKED, kind: `${MASKED}-trait`, data: { configuration: { '!prefix': 'string' }, view: { $if: [{ $eq: ['#.at', 'public'] }, '***', '#.value'] } } },
    { id: MASKING, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, [MASKED]: { configuration: { prefix: 'secret: ' } } } } },
    {
        id: `${VETO}-trait`,
        kind: 'kind',
        data: {
            extends: 'valued-entity-trait',
            operations: { initialize: { implementation: { set: true } } }
        }
    },
    {
        id: VETO,
        kind: `${VETO}-trait`,
        data: {
            configuration: { '!reason': 'string' },
            guard: { if: { $eq: ['#.input.change.operation', 'delete'] }, then: { throw: { code: 'conflict', message: '#.input.configuration.reason' } } }
        }
    },
    { id: HOOKED, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, [VETO]: { configuration: { reason: 'deletion vetoed' } } } } },
    { id: BODYLESS, kind: 'entity-type', data: { traits: { [NOTE]: { configuration: { prefix: 'plain: ' } } } } },
    { id: NOTED, kind: 'kind', data: { extends: 'entity-type', fixed: { traits: { [NOTE]: { configuration: { prefix: 'class: ' } } } } } },
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
    fill('change-concurrently', ORDER, 'guards', {
        if: { $eq: ['#.input.before.businessKey', 'o-raced'] },
        then: {
            if: { $eq: ['#.input.operation', 'delete'] },
            then: { inputMap: { businessKey: 'o-raced', revision: '#.input.before.revision', trait: 'body', operation: 'update', input: { value: { amount: 2 } } }, invoke: ORDER, operation: 'run' }
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
    fill('refuse-derived-double', REVERSED, 'reactions', {
        if: { $any: { collection: { $coalesce: ['#.input.commands', []] }, as: 'command', predicate: { $eq: ['@command.key', DOUBLE] } } },
        then: { throw: 'derived command seen' }
    }),
    fill('refuse-derived-double-result', RESULT_GUARDED, 'resultGuards', {
        if: { $any: { collection: { $coalesce: ['#.input.commands', []] }, as: 'command', predicate: { $eq: ['@command.key', DOUBLE] } } },
        then: { throw: { code: 'forbidden', message: 'derived double refused' } }
    }, { on: ['trait'] }),
    fill('fail-on-unlucky-amount', ORDER, 'reactions', {
        if: { $eq: ['#.input.after.data.body.amount', 13] },
        then: { throw: 'unlucky amount' }
    }),
    { id: CONTRACT_BODY, kind: 'schema', data: { '!holder': 'string' } },
    { id: CONTRACT_CLASS, kind: 'kind', data: { extends: 'entity-type', shape: { lineOfBusiness: 'string', 'traits{}': '@entity-trait-entry' }, mapping: { traits: '#.data.traits' } } },
    {
        id: CONSTRUCTION,
        kind: CONTRACT_CLASS,
        data: {
            lineOfBusiness: 'marine',
            traits: {
                body: { configuration: { schema: { '$data#&': [`@${CONTRACT_BODY}`, { '!project': 'string' }] } } },
                'business-key': { configuration: { rule: { set: { $str: ['CON-', '#.input.traits.body.project'] } } } }
            }
        }
    },
    fill('keep-marine-contracts', CONTRACT_CLASS, 'guards', {
        if: { $eq: ['#.self.data.lineOfBusiness', 'marine'] },
        then: { throw: { code: 'conflict', message: 'marine contracts are kept' } }
    }, { on: ['delete'] }),
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
        expect(created.data).to.deep.equal({ 'business-key': 'o-1', body: { amount: 5 }, [NOTE]: 'order: new' });
        expect(await invoke(ORDER, 'read', { businessKey: 'o-1' })).to.deep.equal(created);
    });

    it('creates an entity without a body', async () => {
        const created = await invoke(BODYLESS, 'create', { businessKey: 'b-1' });
        expect(created.data).to.deep.equal({ 'business-key': 'b-1', [NOTE]: 'plain: new' });
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
            errorOf(invoke(ORDER, 'run', { businessKey: 'o-hidden', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 'x' } } })),
            errorOf(invoke(ORDER, 'writeTrait', { businessKey: 'o-hidden', revision: 1, key: 'other', command: 'x', value: {} })),
            errorOf(invoke(ORDER, 'delete', { businessKey: 'o-hidden', revision: 1 }))
        ]);
        expect(errors.map(error => error.code)).to.deep.equal(['not-found', 'not-found', 'not-found', 'not-found']);
    });

    it('runs a guard only on the operations it is on', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-kept', traits: { body: { amount: 1 } } });
        expect((await invoke(ORDER, 'read', { businessKey: 'o-kept' })).businessKey).to.equal('o-kept');
        expect((await invoke(ORDER, 'run', { businessKey: 'o-kept', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } })).revision).to.equal(2);
        expect((await errorOf(invoke(ORDER, 'delete', { businessKey: 'o-kept', revision: 2 }))).message).to.equal('kept');
    });

    it('rolls the write back when a reaction fails', async () => {
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 'o-13', traits: { body: { amount: 13 } } }))).message).to.equal('unlucky amount');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-13' }))).code).to.equal('not-found');
    });

    it('runs the guard hook of its traits', async () => {
        await invoke(HOOKED, 'create', { businessKey: 'h-1', traits: { body: {} } });
        expect((await errorOf(invoke(HOOKED, 'delete', { businessKey: 'h-1', revision: 1 }))).message).to.equal('deletion vetoed');
    });

    it('updates the body with optimistic concurrency, keeps the traits and reads past revisions', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-4', traits: { body: { amount: 1 } } });
        const updated = await invoke(ORDER, 'run', { businessKey: 'o-4', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } });
        expect([updated.revision, updated.data.body, updated.data[NOTE]]).to.deep.equal([2, { amount: 2 }, 'order: new']);
        expect((await errorOf(invoke(ORDER, 'run', { businessKey: 'o-4', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 3 } } }))).code).to.equal('conflict');
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
            const updated = await invoke(DERIVING, 'run', { businessKey: 'd-1', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 5 } } });
            expect([updated.revision, updated.data[TOTAL], updated.data[DOUBLE]]).to.deep.equal([2, 5, 10]);
        });

        it('converge whatever the order of the traits, a derive that is stale again being consulted again', async () => {
            const created = await invoke(REVERSED, 'create', { businessKey: 'r-1', traits: { body: { amount: 3 } } });
            expect([created.revision, created.data[TOTAL], created.data[DOUBLE]]).to.deep.equal([1, 3, 6]);
        });

        it('show a reaction the commands the derivation ran as well as those requested', async () => {
            const created = await invoke(REVERSED, 'create', { businessKey: 'r-2', traits: { body: { amount: 3 } } });
            const error = await errorOf(invoke(REVERSED, 'run', { businessKey: 'r-2', revision: created.revision, trait: 'body', operation: 'update', input: { value: { amount: 5 } } }));
            expect(error.message).to.equal('derived command seen');
        });

        it('run result guards on the whole sequence of commands, writing nothing when one refuses', async () => {
            const created = await invoke(RESULT_GUARDED, 'create', { businessKey: 'g-1', traits: { body: { amount: 3 } } });
            const error = await errorOf(invoke(RESULT_GUARDED, 'run', { businessKey: 'g-1', revision: created.revision, trait: 'body', operation: 'update', input: { value: { amount: 5 } } }));
            expect([error.code, error.message]).to.deep.equal(['forbidden', 'derived double refused']);
            expect((await invoke(RESULT_GUARDED, 'read', { businessKey: 'g-1' })).revision).to.equal(created.revision);
        });

        it('preview the whole write: the derived commands and the entity after them, the guards of both phases run, nothing written', async () => {
            const created = await invoke(PREVIEWED, 'create', { businessKey: 'p-1', traits: { body: { amount: 3 } } });
            const preview = await invoke(PREVIEWED, 'run', { businessKey: 'p-1', revision: created.revision, trait: PREVIEWING, operation: 'preview', input: { amount: 5 } });
            expect(preview.commands.map(command => [command.key, command.value])).to.deep.equal([['body', { amount: 5 }], [TOTAL, 5], [DOUBLE, 10]]);
            expect([preview.entity.data[TOTAL], preview.entity.data[DOUBLE]]).to.deep.equal([5, 10]);
            expect((await invoke(PREVIEWED, 'read', { businessKey: 'p-1' })).data[TOTAL]).to.equal(3);
        });

        it('consult a derive again only for the keys it declares, and on the first iteration alone when it declares none', async () => {
            const created = await invoke(UNDECLARED, 'create', { businessKey: 'u-1', traits: { body: { amount: 3 } } });
            expect([created.data[TOTAL], created.data[DOUBLE]]).to.deep.equal([3, 0]);
        });

        it('run the operations a derive requests one after the other, each seeing the value the one before left', async () => {
            const created = await invoke(CHAINING, 'create', { businessKey: 'c-1', traits: { body: { amount: 1 } } });
            expect(created.data[ADDED]).to.equal(3);
        });

        it('stop a derivation that does not settle at the limit of steps, with the commands it ran', async () => {
            const error = await errorOf(invoke(RUNAWAY, 'create', { businessKey: 'x-1', traits: { body: { amount: 1 } } }));
            expect([error.code, error.data.commands.length]).to.deep.equal(['derivation-limit', 101]);
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
            await invoke(VERSIONED, 'amend', { businessKey: 'v-1', revision: 1, ref: 'a-1', validFrom: '2025-07-01', body: body('2025-07-01', 110) });
            expect((await stored('v-1')).data.body.map(({ validFrom }) => validFrom)).to.deep.equal(['2025-01-01', '2025-07-01']);
            expect((await invoke(VERSIONED, 'read', { businessKey: 'v-1' })).data.body).to.deep.equal(body('2025-07-01', 110));
            expect((await invoke(VERSIONED, 'read', { businessKey: 'v-1', at: '2025-03-01' })).data.body).to.deep.equal(body('2025-01-01', 100));
            expect((await invoke(VERSIONED, 'read', { businessKey: 'v-1', revision: 1 })).data.body).to.deep.equal(body('2025-01-01', 100));
            expect((await errorOf(invoke(VERSIONED, 'read', { businessKey: 'v-1', at: '2024-01-01' }))).code).to.equal('not-found');
        });

        it('checks the whole body, including an amended one, against the schema', async () => {
            expect((await errorOf(invoke(VERSIONED, 'create', { businessKey: 'v-2', traits: { body: { owner: 'Ada', premium: 'high' } } }))).code).to.equal('invalid');
            await invoke(VERSIONED, 'create', { businessKey: 'v-2', traits: { body: body('2025-01-01', 100) } });
            expect((await errorOf(invoke(VERSIONED, 'amend', { businessKey: 'v-2', revision: 1, ref: 'a-1', validFrom: '2025-07-01', body: body('2025-07-01', 'high') }))).code).to.equal('invalid');
        });

        it('lets update correct a body of one version, its date included, and refuses it once amended', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-3', traits: { body: body('2025-01-01', 100) } });
            const corrected = await invoke(VERSIONED, 'run', { businessKey: 'v-3', revision: 1, trait: 'body', operation: 'update', input: { value: body('2025-02-01', 90) } });
            expect([corrected.revision, corrected.data.body]).to.deep.equal([2, body('2025-02-01', 90)]);
            expect((await stored('v-3')).data.body.map(({ validFrom }) => validFrom)).to.deep.equal(['2025-02-01']);
            await invoke(VERSIONED, 'amend', { businessKey: 'v-3', revision: 2, ref: 'a-1', validFrom: '2025-07-01', body: body('2025-07-01', 95) });
            expect((await errorOf(invoke(VERSIONED, 'run', { businessKey: 'v-3', revision: 3, trait: 'body', operation: 'update', input: { value: body('2025-02-01', 1) } }))).code).to.equal('conflict');
        });

        it('amends from the date of the last version or later, and removes only the last one, by its ref', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-4', traits: { body: body('2025-01-01', 100) } });
            await invoke(VERSIONED, 'amend', { businessKey: 'v-4', revision: 1, ref: 'a-1', validFrom: '2025-07-01', body: body('2025-07-01', 110) });
            expect((await errorOf(invoke(VERSIONED, 'amend', { businessKey: 'v-4', revision: 2, ref: 'a-2', validFrom: '2025-03-01', body: body('2025-03-01', 110) }))).code).to.equal('conflict');
            const second = await invoke(VERSIONED, 'amend', { businessKey: 'v-4', revision: 2, ref: 'a-2', validFrom: '2025-07-01', body: body('2025-07-01', 115) });
            expect([second.revision, second.data.body]).to.deep.equal([3, body('2025-07-01', 115)]);
            expect((await stored('v-4')).data.body.map(({ validFrom, ref }) => [validFrom, ref])).to.deep.equal([['2025-01-01', undefined], ['2025-07-01', 'a-1'], ['2025-07-01', 'a-2']]);
            expect((await errorOf(invoke(VERSIONED, 'unamend', { businessKey: 'v-4', revision: 3, ref: 'a-1', validFrom: '2025-07-01' }))).code).to.equal('conflict');
            expect((await errorOf(invoke(VERSIONED, 'unamend', { businessKey: 'v-4', revision: 3, ref: 'a-2', validFrom: '2025-01-01' }))).code).to.equal('conflict');
            const restored = await invoke(VERSIONED, 'unamend', { businessKey: 'v-4', revision: 3, ref: 'a-2', validFrom: '2025-07-01' });
            expect(restored.data.body).to.deep.equal(body('2025-07-01', 110));
            const removed = await invoke(VERSIONED, 'unamend', { businessKey: 'v-4', revision: 4, ref: 'a-1', validFrom: '2025-07-01' });
            expect(removed.data.body).to.deep.equal(body('2025-01-01', 100));
            expect((await errorOf(invoke(VERSIONED, 'unamend', { businessKey: 'v-4', revision: 5, ref: 'a-1', validFrom: '2025-01-01' }))).code).to.equal('conflict');
        });

        it('keys a body without a date by a marker that the first date replaces', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-5', traits: { body: body(undefined, 100) } });
            expect((await stored('v-5')).data.body.map(({ validFrom }) => validFrom)).to.deep.equal(['undated']);
            await invoke(VERSIONED, 'run', { businessKey: 'v-5', revision: 1, trait: 'body', operation: 'update', input: { value: body('2025-01-01', 100) } });
            expect((await stored('v-5')).data.body.map(({ validFrom }) => validFrom)).to.deep.equal(['2025-01-01']);
        });

        it('returns the body of the last version from every write', async () => {
            await invoke(VERSIONED, 'create', { businessKey: 'v-6', traits: { body: body('2025-01-01', 100) } });
            const amended = await invoke(VERSIONED, 'amend', { businessKey: 'v-6', revision: 1, ref: 'a-1', validFrom: '2025-07-01', body: body('2025-07-01', 110) });
            expect(amended.data.body).to.deep.equal(body('2025-07-01', 110));
        });
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

    it('inherits schema, traits and slots from an entity class, with the business key rule of the entity type', async () => {
        const created = await invoke(CONSTRUCTION, 'create', { traits: { body: { holder: 'Ada', project: 'bridge' } } });
        expect([created.businessKey, created.data[NOTE]]).to.deep.equal(['CON-bridge', 'contract: new (construction)']);
        expect((await errorOf(invoke(CONSTRUCTION, 'create', { traits: { body: { project: 'no holder' } } }))).code).to.equal('invalid');
    });

    it('gives a guard the data of the entity type, which no record stores', async () => {
        const created = await invoke(CONSTRUCTION, 'create', { traits: { body: { holder: 'Ada', project: 'tunnel' } } });
        expect(created.data).to.not.have.property('lineOfBusiness');
        expect((await errorOf(invoke(CONSTRUCTION, 'delete', { businessKey: created.businessKey, revision: created.revision }))).code).to.equal('conflict');
    });

    it('unites the configuration of a trait from the kind chain, the data and the fills', async () => {
        expect((await invoke(CONFIGURED, 'create', { businessKey: 'c-1', traits: { body: {} } })).data[NOTE]).to.equal('class: new');
        expect((await invoke(SPECIALISED, 'create', { businessKey: 'c-1', traits: { body: {} } })).data[NOTE]).to.equal('class: new!');
    });

    it('runs a public operation of a trait, and no private one', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-run', traits: { body: { amount: 1 } } });
        const updated = await invoke(ORDER, 'run', { businessKey: 'o-run', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } });
        expect([updated.revision, updated.data.body]).to.deep.equal([2, { amount: 2 }]);
        expect((await errorOf(invoke(ORDER, 'run', { businessKey: 'o-run', revision: 2, trait: 'body', operation: 'initialize', input: {} }))).code).to.equal('private-operation');
        expect((await errorOf(invoke(ORDER, 'run', { businessKey: 'o-run', revision: 2, trait: 'nothing', operation: 'update', input: { value: {} } }))).code).to.equal('private-operation');
        expect((await errorOf(invoke(ORDER, 'run', { businessKey: 'o-run', trait: 'body', operation: 'update', input: { value: { amount: 3 } } }))).code).to.equal('invalid');
        expect((await errorOf(invoke(ORDER, 'run', { businessKey: 'o-run', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 3 } } }))).code).to.equal('conflict');
    });

    it('reports two traits that offer the same public operation', async () => {
        const offering = id => ({
            id: `${id}-trait`,
            kind: 'kind',
            data: { extends: 'entity-trait', operations: { refresh: { public: true, input: { '$data#&': ['@trait-operation-input', { '!input': 'object' }] }, output: '@trait-command', implementation: { set: { command: 'refresh', value: 1 } } } } }
        });
        const broken = [
            offering(`first-${run}`),
            offering(`second-${run}`),
            { id: `first-${run}`, kind: `first-${run}-trait`, data: { configuration: {} } },
            { id: `second-${run}`, kind: `second-${run}-trait`, data: { configuration: {} } },
            { id: `offering-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, [`first-${run}`]: { configuration: {} }, [`second-${run}`]: { configuration: {} } } } }
        ];
        await stop();
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...broken] });
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages).to.include(`offering-${run}: the traits first-${run} and second-${run} both offer the operation 'refresh'`);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
    });

    it('reports a dependency on a key the entity type has no trait for, and one on a trait without a derive', async () => {
        const broken = [
            { id: `depending-${run}`, kind: WRITING, data: { traits: { body: { configuration: { schema: {} }, dependsOn: ['body'] }, [TOTAL]: { configuration: {}, dependsOn: ['body', 'missing'] } } } }
        ];
        await stop();
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...broken] });
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages).to.include.members([
            `trait '${TOTAL}' of depending-${run} depends on 'missing', which the entity type has no trait for`,
            `trait 'body' of depending-${run} depends on keys and has no derive`
        ]);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
    });

    it('reports a guard hook of a trait that writes', async () => {
        const writing = [
            {
                id: `writing-hook-${run}-trait`,
                kind: 'kind',
                data: {
                    extends: 'valued-entity-trait',
                    operations: { initialize: { implementation: { set: true } } }
                }
            },
            {
                id: `writing-hook-${run}`,
                kind: `writing-hook-${run}-trait`,
                data: {
                    configuration: {},
                    guard: { inputMap: { businessKey: 'o-raced', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } }, invoke: ORDER, operation: 'run' }
                }
            },
            { id: `hooking-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, [`writing-hook-${run}`]: { configuration: {} } } } }
        ];
        await stop();
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...writing] });
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages.some(message => message.startsWith(`trait 'writing-hook-${run}': its guard may only read and trace, but has write: `))).to.equal(true);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
    });

    it('reports a derive hook and a command operation of a trait that write', async () => {
        const id = `writing-derive-${run}`;
        const writing = [
            {
                id: `${id}-trait`,
                kind: 'kind',
                data: {
                    extends: 'valued-entity-trait',
                    operations: {
                        initialize: { implementation: { set: true } },
                        rewrite: {
                            input: '@trait-operation-input',
                            output: '@trait-command',
                            implementation: [{ inputMap: { businessKey: 'o-raced', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } }, invoke: ORDER, operation: 'run' }, { set: { command: 'rewrite', value: true } }]
                        }
                    }
                }
            },
            {
                id,
                kind: `${id}-trait`,
                data: {
                    configuration: {},
                    derive: { inputMap: { businessKey: 'o-raced', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } }, invoke: ORDER, operation: 'run' }
                }
            },
            { id: `deriving-writer-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, [id]: { configuration: {}, dependsOn: ['body'] } } } }
        ];
        await stop();
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...writing] });
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages.some(message => message.startsWith(`trait '${id}': its derive may only read and trace, but has write: `))).to.equal(true);
        expect(messages.some(message => message.startsWith(`trait '${id}': its operation 'rewrite' returns a command, so it may only read and trace, but has write: `))).to.equal(true);
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
            fill('keyed-note', `bad-${run}`, 'traits', { trait: NOTE, key: 'memo', configuration: { prefix: 'p' } }),
            fill('body-note', `bad-${run}`, 'traits', { trait: NOTE, key: 'body', configuration: { prefix: 'p' } }),
            fill('dotted-note', `bad-${run}`, 'traits', { trait: NOTE, key: 'first.one', configuration: { prefix: 'p' } }),
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
            `trait '${NOTE}' is used under the key 'memo', and its key is '${NOTE}'`,
            `key 'body' is used by the traits body and ${NOTE}`,
            "key 'first.one' is not lowercase letters and digits in segments joined by '-'",
            `undated-field-${run}: the field '/startDate' of the versioned body is no date (a string that matches YYYY-MM-DD)`,
            `missing-field-${run}: the pointer '/begin' of the versioned body is no field of its schema`
        ]);
        expect(messages.some(message => message.includes("can't change the value at 'configuration.prefix'"))).to.equal(true);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
    });
});
