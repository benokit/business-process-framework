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

const prefixed = id => ({ id: `${id}-trait`, kind: 'kind', data: { extends: 'entity-trait', operations: { initialize: { implementation: { set: { $str: ['#.input.configuration.prefix', { $coalesce: ['#.input.input', 'new'] }, { $coalesce: ['#.input.configuration.suffix', ''] }] } } } } } });

const elements = [
    prefixed(NOTE),
    { id: NOTE, kind: `${NOTE}-trait`, data: { configuration: { '!prefix': 'string' } } },
    prefixed(TAG),
    { id: TAG, kind: `${TAG}-trait`, data: { cardinality: 'many', configuration: { '!prefix': 'string' } } },
    { id: TAGGED, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } } } } },
    fill('tagged-first', TAGGED, 'traits', { trait: TAG, key: 'first', configuration: { prefix: 'a: ' } }),
    fill('tagged-second', TAGGED, 'traits', { trait: TAG, key: 'second', configuration: { prefix: 'b: ' } }),
    { id: NOTED, kind: 'kind', data: { extends: 'entity-type', fixed: { traits: { [NOTE]: { configuration: { prefix: 'class: ' } } } } } },
    { id: CONFIGURED, kind: NOTED, data: { traits: { body: { configuration: { schema: {} } } } } },
    { id: SPECIALISED, kind: NOTED, data: { traits: { body: { configuration: { schema: {} } } } } },
    fill('specialised-note', SPECIALISED, 'traits', { key: NOTE, configuration: { suffix: '!' } }),
    { id: ORDER, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!amount': 'number', note: 'string' } } } } } },
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
            then: { inputMap: { entityType: ORDER, businessKey: 'o-raced', revision: '#.input.before.revision', value: { amount: 2 } }, invoke: 'entity-bodies', operation: 'put' }
        }
    }),
    fill('fail-on-unlucky-amount', ORDER, 'reactions', {
        if: { $eq: ['#.input.after.data.body.amount', 13] },
        then: { throw: 'unlucky amount' }
    }),
    { id: CONTRACT_BODY, kind: 'schema', data: { '!holder': 'string' } },
    { id: CONTRACT_CLASS, kind: 'kind', data: { extends: 'entity-type' } },
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

    it('rolls the write back when a reaction fails', async () => {
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 'o-13', traits: { body: { amount: 13 } } }))).message).to.equal('unlucky amount');
        expect((await errorOf(invoke(ORDER, 'read', { businessKey: 'o-13' }))).code).to.equal('not-found');
    });

    it('updates the body with optimistic concurrency, keeps the traits and reads past revisions', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-4', traits: { body: { amount: 1 } } });
        const updated = await invoke('entity-bodies', 'put', { entityType: ORDER, businessKey: 'o-4', revision: 1, value: { amount: 2 } });
        expect([updated.revision, updated.data.body, updated.data[NOTE]]).to.deep.equal([2, { amount: 2 }, 'order: new']);
        expect((await errorOf(invoke('entity-bodies', 'put', { entityType: ORDER, businessKey: 'o-4', revision: 1, value: { amount: 3 } }))).code).to.equal('conflict');
        expect((await invoke(ORDER, 'read', { businessKey: 'o-4', revision: 1 })).data.body.amount).to.equal(1);
    });

    it('writes a declared trait only, keeping the body', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-5', traits: { body: { amount: 1 } } });
        const written = await invoke(ORDER, 'writeTrait', { businessKey: 'o-5', revision: 1, key: NOTE, command: 'rewrite', value: 'changed' });
        expect([written.revision, written.data.body.amount, written.data[NOTE]]).to.deep.equal([2, 1, 'changed']);
        expect((await errorOf(invoke(ORDER, 'writeTrait', { businessKey: 'o-5', revision: 2, key: 'other', command: 'x', value: {} }))).code).to.equal('invalid');
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
        const { items, total } = await invoke('entity-database', 'list', { entityType: ORDER, limit: 2 });
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

    it('reports invalid trait uses in validate()', async () => {
        const broken = [
            { id: `schemaless-${run}`, kind: 'entity-type', data: {} },
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
            fill('repeated-tag', TAGGED, 'traits', { trait: TAG, key: 'first', configuration: { prefix: 'again' } })
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
            `trait 'first' is used twice on ${TAGGED}`
        ]);
        expect(messages.some(message => message.includes("can't change the value at 'configuration.prefix'"))).to.equal(true);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
    });
});
