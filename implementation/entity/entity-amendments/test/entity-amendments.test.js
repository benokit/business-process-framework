import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const POLICY = `policy-${run}`;
const RAISE = `raise-${run}`;
const COPY = `copy-${run}`;
const END = `end-${run}`;
const OTHER = `other-${run}`;
const BODY = { '!holder': 'string', '!startDate': '@date', '!premium': 'number', endDate: '@date', '*': 'never' };
const VALID_FROM = '#.effectiveFrom';
const AMENDMENT_KEY = '#.amendment.businessKey';

const amendmentType = (id, schema) => ({ id, kind: 'entity-type', data: { traits: { body: { configuration: { schema } } } } });

const amend = patch => ({ key: 'body', operation: 'amend', input: { validFrom: VALID_FROM, ref: AMENDMENT_KEY, body: { '$func/patched-body': { body: { '$func/record-body': '#.entity' }, patch } } } });

const configuration = amendable => ({ id: `${POLICY}-${Object.keys(amendable)[0]}`, kind: 'slot-fill', data: { target: POLICY, slot: 'traits', value: { key: 'amendable', configuration: amendable } } });

const elements = [
    {
        id: POLICY,
        kind: 'entity-type',
        data: {
            traits: {
                body: { trait: 'versioned-body', configuration: { schema: BODY, versioned: { validFrom: '/startDate' } } },
                state: {
                    configuration: {
                        states: { status: { draft: true, active: true, cancelled: true } },
                        transitions: { activate: { status: { draft: 'active' } }, cancel: { status: { active: 'cancelled' } }, reactivate: { status: { cancelled: 'active' } } },
                        initialStates: { default: { status: 'draft' } },
                        operations: { propose: { status: { active: true } }, apply: { status: { active: true } } }
                    }
                },
                amendable: {
                    configuration: {
                        [RAISE]: {
                            mapping: { reason: '#.input.reason', changes: '#.input.changes' },
                            applicable: { $neq: ['#.amendment.data.body.reason', 'draft'] },
                            apply: [amend([{ op: 'replace', path: '/premium', value: '#.amendment.data.body.changes.premium' }])]
                        },
                        [END]: {
                            apply: [amend([{ op: 'add', path: '/endDate', value: VALID_FROM }]), { key: 'state', operation: 'transition', input: { transition: 'cancel' } }],
                            revert: [
                                { key: 'body', operation: 'remove', input: { validFrom: VALID_FROM, ref: AMENDMENT_KEY } },
                                { key: 'state', operation: 'transition', input: { transition: 'reactivate' } }
                            ]
                        },
                        [COPY]: {}
                    }
                }
            }
        }
    },
    amendmentType(RAISE, { '!reason': 'string', '!changes': { '!premium': 'number' } }),
    amendmentType(COPY, BODY),
    amendmentType(END, { '!reason': 'string' }),
    amendmentType(OTHER, { '!reason': 'string' })
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'entity-amendments'];

const errorOf = promise => promise.then(() => null, error => error);

const policy = async (businessKey, { activate = true } = {}) => {
    const created = await invoke(POLICY, 'create', { businessKey, traits: { body: { holder: 'Ada', startDate: '2026-01-01', premium: 100 } } });
    return activate ? invoke(POLICY, 'run', { businessKey, revision: created.revision, trait: 'state', operation: 'transition', input: { transition: 'activate' } }) : created;
};

const amendable = (businessKey, operation, input) => invoke(POLICY, 'run', { businessKey, trait: 'amendable', operation, input });

const propose = (businessKey, effectiveFrom, value, amendmentType = RAISE, input = { reason: 'indexation', changes: { premium: value } }) => amendable(businessKey, 'propose', { amendmentType, effectiveFrom, input });

const apply = (businessKey, amendment) => amendable(businessKey, 'apply', { amendment: amendment.businessKey });

const revert = (businessKey, amendment) => amendable(businessKey, 'revert', { amendment: amendment.businessKey });

const discard = (businessKey, amendment) => amendable(businessKey, 'discard', { amendment: amendment.businessKey });

const read = (businessKey, at) => invoke(POLICY, 'read', { businessKey, at });

const ledger = async businessKey => (await read(businessKey)).data.amendable;

const statuses = async businessKey => (await ledger(businessKey)).entries.map(({ key, status }) => [key, status]);

describe('entity-amendments', function () {
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

    it('proposes an amendment only for an entity its model allows to amend, of a type it lists', async () => {
        await policy('a-draft', { activate: false });
        expect((await errorOf(propose('a-draft', '2026-07-01', 110))).code).to.equal('conflict');
        await policy('a-1');
        expect((await errorOf(propose('a-1', '2026-07-01', 110, OTHER))).code).to.equal('invalid');
        const before = await read('a-1');
        const proposed = await propose('a-1', '2026-07-01', 110);
        expect([proposed.businessKey, proposed.data.body]).to.deep.equal(['a-1-001', { reason: 'indexation', changes: { premium: 110 } }]);
        expect((await ledger('a-1'))).to.deep.equal({ last: 1, entries: [{ key: 'a-1-001', type: RAISE, effectiveFrom: '2026-07-01', proposedAt: before.revision + 1, status: 'pending' }] });
    });

    it('allows one open amendment, which is closed by applying or discarding it, and numbers them without gaps', async () => {
        await policy('a-2');
        const first = await propose('a-2', '2026-07-01', 110);
        expect((await errorOf(propose('a-2', '2026-08-01', 120))).code).to.equal('conflict');
        await discard('a-2', first);
        expect(await statuses('a-2')).to.deep.equal([['a-2-001', 'discarded']]);
        expect((await read('a-2')).data.body.premium).to.equal(100);
        expect((await propose('a-2', '2026-08-01', 120)).businessKey).to.equal('a-2-002');
        expect((await errorOf(discard('a-2', first))).code).to.equal('conflict');
    });

    it('applies an amendment as a version valid from its date, and reverts it', async () => {
        await policy('a-3');
        await apply('a-3', await propose('a-3', '2026-07-01', 110));
        const amended = await read('a-3');
        expect([amended.data.body.premium, amended.data.body.startDate, await statuses('a-3')]).to.deep.equal([110, '2026-07-01', [['a-3-001', 'applied']]]);
        expect((await read('a-3', '2026-03-01')).data.body.premium).to.equal(100);

        await revert('a-3', { businessKey: 'a-3-001' });
        expect([(await read('a-3')).data.body.premium, (await read('a-3')).data.body.startDate, await statuses('a-3')]).to.deep.equal([100, '2026-01-01', [['a-3-001', 'discarded']]]);
        expect((await errorOf(apply('a-3', { businessKey: 'a-3-001' }))).code).to.equal('conflict');
    });

    it('reverts amendments in the reverse order of their application', async () => {
        await policy('a-4');
        const first = await propose('a-4', '2026-07-01', 110);
        await apply('a-4', first);
        const second = await propose('a-4', '2027-01-01', 120);
        await apply('a-4', second);
        expect((await errorOf(revert('a-4', first))).code).to.equal('conflict');
        await revert('a-4', second);
        await revert('a-4', first);
        expect((await read('a-4')).data.body.premium).to.equal(100);
    });

    it('refuses to apply an amendment dated before the last version, leaving everything as it was', async () => {
        await policy('a-5');
        const early = await propose('a-5', '2025-12-31', 90);
        expect((await errorOf(apply('a-5', early))).code).to.equal('conflict');
        const unchanged = await read('a-5');
        expect([unchanged.data.body.premium, await statuses('a-5')]).to.deep.equal([100, [['a-5-001', 'pending']]]);
    });

    it('applies an amendment only when its kind says it is applicable', async () => {
        await policy('a-14');
        const draft = await propose('a-14', '2026-07-01', 110, RAISE, { reason: 'draft', changes: { premium: 110 } });
        expect((await errorOf(apply('a-14', draft))).code).to.equal('conflict');
        expect(await statuses('a-14')).to.deep.equal([['a-14-001', 'pending']]);
        await discard('a-14', draft);
        await apply('a-14', await propose('a-14', '2026-07-01', 120));
        expect((await read('a-14')).data.body.premium).to.equal(120);
    });

    it('leaves nothing behind when the amendment cannot be created', async () => {
        await policy('a-6');
        const error = await errorOf(propose('a-6', '2026-07-01', undefined, RAISE, { reason: 'indexation', changes: { premium: 'high' } }));
        expect(error.code).to.equal('invalid');
        expect(await ledger('a-6')).to.deep.equal({ last: 0, entries: [] });
        expect((await propose('a-6', '2026-07-01', 110)).businessKey).to.equal('a-6-001');
    });

    it('runs only the public operations of a trait', async () => {
        await policy('a-7');
        const errors = await Promise.all(['open', 'settle', 'plan', 'initialize'].map(operation => errorOf(amendable('a-7', operation, { amendment: 'x' }))));
        expect(errors.map(({ code }) => code)).to.deep.equal(['private-operation', 'private-operation', 'private-operation', 'private-operation']);
        expect((await errorOf(invoke(POLICY, 'applyTraitOperations', {}))).code).to.equal('private-operation');
    });

    it('copies the last version into an amendment of a kind with the defaults, and applies it from the date of the amendment', async () => {
        await policy('a-8');
        const proposed = await propose('a-8', '2026-07-01', undefined, COPY, { holder: 'Ada', startDate: '2026-01-01', premium: 130 });
        expect(proposed.data.body.premium).to.equal(130);
        await apply('a-8', proposed);
        expect(await read('a-8').then(({ data }) => [data.body.premium, data.body.startDate])).to.deep.equal([130, '2026-07-01']);
    });

    it('previews the commands an amendment writes, writing nothing', async () => {
        await policy('a-9');
        const proposed = await propose('a-9', '2026-07-01', 110);
        const before = await read('a-9');
        const commands = await amendable('a-9', 'preview', { amendment: proposed.businessKey, effect: 'apply' });
        expect(commands.map(({ key, command }) => [key, command])).to.deep.equal([['body', 'amend'], ['amendable', 'applied']]);
        expect(await read('a-9')).to.deep.equal(before);
        await apply('a-9', proposed);
        expect((await read('a-9')).data.body).to.deep.equal({ holder: 'Ada', startDate: '2026-07-01', premium: 110 });
    });

    it('moves the state in the same change as the body, and moves it back when the amendment is reverted', async () => {
        await policy('a-11');
        const before = await read('a-11');
        const proposed = await propose('a-11', '2026-07-01', undefined, END, { reason: 'lapsed' });
        const preview = await amendable('a-11', 'preview', { amendment: proposed.businessKey, effect: 'apply' });
        expect(preview.map(({ key, command }) => [key, command])).to.deep.equal([['body', 'amend'], ['state', 'cancel'], ['amendable', 'applied']]);
        await apply('a-11', proposed);
        const cancelled = await read('a-11');
        expect([cancelled.data.state.status, cancelled.data.body.endDate, cancelled.revision]).to.deep.equal(['cancelled', '2026-07-01', before.revision + 2]);
        expect((await errorOf(propose('a-11', '2026-08-01', 120))).code).to.equal('conflict');
        await revert('a-11', proposed);
        const reactivated = await read('a-11');
        expect([reactivated.data.state.status, reactivated.data.body.endDate]).to.deep.equal(['active', undefined]);
    });

    it('rolls the application back when the state cannot move', async () => {
        await policy('a-12');
        const proposed = await propose('a-12', '2026-07-01', undefined, END, { reason: 'lapsed' });
        const current = await read('a-12');
        await invoke(POLICY, 'run', { businessKey: 'a-12', revision: current.revision, trait: 'state', operation: 'transition', input: { transition: 'cancel' } });
        expect((await errorOf(apply('a-12', proposed))).code).to.equal('conflict');
        expect((await read('a-12')).data.body.endDate).to.equal(undefined);
    });

    it('refuses to apply an amendment once the entity moved on from the revision it was proposed at', async () => {
        await policy('a-10');
        const proposed = await propose('a-10', '2026-07-01', 110);
        const current = await read('a-10');
        await invoke(POLICY, 'run', { businessKey: 'a-10', revision: current.revision, trait: 'body', operation: 'update', input: { value: { holder: 'Grace', startDate: '2026-01-01', premium: 100 } } });
        expect((await errorOf(apply('a-10', proposed))).code).to.equal('conflict');
        expect((await read('a-10')).data.body.holder).to.equal('Grace');
    });

    const messagesWith = async extra => {
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, ...extra] });
        const messages = validate().flatMap(problem => problem.message.replace(/^state: /, '').split('; '));
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
        return messages;
    };

    it('reports a mapping of a kind that reads a field the entity does not have', async () => {
        const wrong = `${RAISE}-wrong`;
        const messages = (await messagesWith([amendmentType(wrong, { '!reason': 'string' }), configuration({ [wrong]: { mapping: { reason: '#.input.why', holder: '#.entity.data.body.owner' } } })])).join('\n');
        expect(messages).to.include(`the mapping of ${wrong}`).and.to.include('owner');
    });

    it('reports an apply that reads a field neither the entity, the amendment nor the date has', async () => {
        const wrong = `${RAISE}-wrong`;
        const broken = configuration({ [wrong]: { apply: [{ key: 'body', operation: 'amend', input: { validFrom: '#.since', ref: '#.amendment.nope', body: { holder: 'Ada', premium: 'high' } } }] } });
        const messages = (await messagesWith([amendmentType(wrong, { '!reason': 'string' }), broken])).join('\n');
        expect(messages).to.include(`the apply of ${wrong}`).and.to.include('since').and.to.include('nope').and.to.include('premium');
    });

    it('reports a mapping that does not fit the body it produces', async () => {
        const misshaped = `${RAISE}-misshaped`;
        const messages = (await messagesWith([amendmentType(misshaped, { '!reason': 'string' }), configuration({ [misshaped]: { mapping: { reason: 5 } } })])).join('\n');
        expect(messages).to.include(`the mapping of ${misshaped}`).and.to.include('reason');
    });

    it('reports a kind whose apply changes a trait that its revert leaves, names no trait of the entity or no operation of it, or no entity type', async () => {
        const unpaired = `${END}-unpaired`;
        const broken = configuration({
            [unpaired]: {
                apply: [
                    { key: 'state', operation: 'transition', input: { transition: 'cancel' } },
                    { key: 'ownership', operation: 'put', input: {} },
                    { key: 'body', operation: 'nope', input: {} }
                ],
                revert: [{ key: 'body', operation: 'remove', input: { validFrom: VALID_FROM, ref: AMENDMENT_KEY } }]
            },
            'no-such-type': {}
        });
        const messages = (await messagesWith([amendmentType(unpaired, { '!reason': 'string' }), broken])).join('\n');
        expect(messages).to.include("changes 'state' and its revert doesn't").and.to.include("has no trait 'ownership'").and.to.include('has no such operation').and.to.include("names 'no-such-type' as an amendment type, which is no entity type");
    });
});
