import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const POLICY = `policy-${run}`;
const RAISE = `raise-${run}`;
const COPY = `copy-${run}`;
const END = `end-${run}`;
const NOTE = `note-${run}`;
const BODY = { '!holder': 'string', '!startDate': '@date', '!premium': 'number', endDate: '@date', '*': 'never' };
const VALID_FROM = '#.link.context.effectiveFrom';
const AMENDMENT_KEY = '#.generated.businessKey';

const amendmentType = (id, schema) => ({
    id,
    kind: 'amendment-entity-type',
    data: {
        traits: {
            body: { configuration: { schema } },
            state: {
                configuration: {
                    states: { status: { draft: true, issued: true, active: true, cancelled: true, annulled: true } },
                    transitions: {
                        issue: { status: { draft: 'issued' } },
                        activate: { status: { issued: 'active' }, versionStatus: { pending: 'applied' } },
                        cancel: { status: { draft: 'cancelled', issued: 'cancelled' }, versionStatus: { pending: 'discarded' } },
                        annul: { status: { active: 'annulled' }, versionStatus: { applied: 'discarded' } }
                    },
                    initialStates: { default: { status: 'draft' } }
                }
            }
        }
    }
});

const declaration = (id, declarations) => ({ id: `${POLICY}-${id}`, kind: 'slot-fill', data: { target: POLICY, slot: 'traits', value: { key: 'amendments', configuration: { declarations } } } });

const elements = [
    {
        id: POLICY,
        kind: 'versioned-entity-type',
        data: {
            traits: {
                notes: { trait: 'generator', configuration: { declarations: { note: { type: NOTE } } } },
                body: { trait: 'versioned-body', configuration: { schema: BODY, versioned: { validFrom: '/startDate' } } },
                state: {
                    configuration: {
                        states: { status: { draft: true, active: true, cancelled: true } },
                        transitions: { activate: { status: { draft: 'active' } }, cancel: { status: { active: 'cancelled' } }, reactivate: { status: { cancelled: 'active' } } },
                        initialStates: { default: { status: 'draft' } },
                        operations: { generate: { status: { active: true } }, 'amendments/apply': { status: { active: true } } }
                    }
                }
            }
        }
    },
    { id: NOTE, kind: 'body-entity-type', data: { traits: { body: { configuration: { schema: { '!text': 'string' } } }, generated: { configuration: {} } } } },
    amendmentType(RAISE, { '!reason': 'string', '!changes': { '!premium': 'number' } }),
    amendmentType(COPY, BODY),
    amendmentType(END, { '!reason': 'string' }),
    { id: `${RAISE}-input`, kind: 'schema', data: { '!reason': 'string', '!changes': { '!premium': 'number' }, '*': 'never' } },
    declaration('raise', {
        [RAISE]: {
            type: RAISE,
            input: `${RAISE}-input`,
            open: { body: { reason: '#.input.reason', changes: '#.input.changes' } },
            effects: {
                apply: [{
                    key: 'body',
                    operation: 'amend',
                    input: { validFrom: VALID_FROM, ref: AMENDMENT_KEY, body: { '$func/patched-body': { body: { '$func/record-body': '#.source' }, patch: [{ op: 'replace', path: '/premium', value: '#.generated.data.body.changes.premium' }] } } }
                }]
            }
        }
    }),
    declaration('end', {
        [END]: {
            type: END,
            open: { body: { reason: '#.input.reason' } },
            effects: {
                apply: [
                    { key: 'body', operation: 'amend', input: { validFrom: VALID_FROM, ref: AMENDMENT_KEY, body: { '$func/patched-body': { body: { '$func/record-body': '#.source' }, patch: [{ op: 'add', path: '/endDate', value: VALID_FROM }] } } } },
                    { key: 'state', operation: 'transition', input: { transition: 'cancel' } }
                ],
                revert: [
                    { key: 'body', operation: 'remove', input: { validFrom: VALID_FROM, ref: AMENDMENT_KEY } },
                    { key: 'state', operation: 'transition', input: { transition: 'reactivate' } }
                ]
            }
        }
    }),
    declaration('copy', { [COPY]: { type: COPY } })
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'entity-generation', 'entity-amendments'];

const errorOf = promise => promise.then(() => null, error => error);

const policy = async (businessKey, { activate = true } = {}) => {
    const created = await invoke(POLICY, 'create', { businessKey, traits: { body: { holder: 'Ada', startDate: '2026-01-01', premium: 100 } } });
    return activate ? invoke(POLICY, 'transition', { businessKey, revision: created.revision, transition: 'activate' }) : created;
};

const generate = (businessKey, effectiveFrom, generator, input) => invoke(POLICY, 'generate', {
    businessKey, generator: 'amendments', declaration: generator, input, context: { effectiveFrom }
});

const propose = (businessKey, effectiveFrom, value, amendmentType = RAISE, input = { reason: 'indexation', changes: { premium: value } }) => generate(businessKey, effectiveFrom, amendmentType, input);

const move = (amendment, transition) => invoke(amendment.entityType, 'transition', { businessKey: amendment.businessKey, revision: amendment.revision, transition });

const issue = amendment => move(amendment, 'issue');

const activate = async amendment => move(await issue(amendment), 'activate');

const read = (businessKey, at) => invoke(POLICY, 'read', { businessKey, at });

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
        expect((await errorOf(propose('a-1', '2026-07-01', 110, `${RAISE}-other`))).code).to.equal('invalid');
        const proposed = await propose('a-1', '2026-07-01', 110);
        expect([proposed.businessKey, proposed.data.state.status, proposed.data.body.reason]).to.deep.equal(['a-1-001', 'draft', 'indexation']);
        expect((await read('a-1')).data['amendment-ledger']).to.deep.equal({ last: 1, open: 'a-1-001' });
    });

    it('allows one open amendment, which is closed by activating or cancelling it, and numbers them without gaps', async () => {
        await policy('a-2');
        const first = await propose('a-2', '2026-07-01', 110);
        expect((await errorOf(propose('a-2', '2026-08-01', 120))).code).to.equal('conflict');
        const cancelled = await move(await issue(first), 'cancel');
        expect(cancelled.data.state.status).to.equal('cancelled');
        expect((await read('a-2')).data['amendment-ledger']).to.deep.equal({ last: 1, open: null });
        expect((await read('a-2')).data.body.premium).to.equal(100);
        expect((await propose('a-2', '2026-08-01', 120)).businessKey).to.equal('a-2-002');
    });

    it('applies an activated amendment as a version valid from its date, and reverts an annulled one', async () => {
        await policy('a-3');
        const raised = await activate(await propose('a-3', '2026-07-01', 110));
        expect(raised.data.state.status).to.equal('active');
        const amended = await read('a-3');
        expect([amended.data.body.premium, amended.data.body.startDate, amended.data['amendment-ledger']]).to.deep.equal([110, '2026-07-01', { last: 1, open: null }]);
        expect((await read('a-3', '2026-03-01')).data.body.premium).to.equal(100);

        await move(raised, 'annul');
        expect([(await read('a-3')).data.body.premium, (await read('a-3')).data.body.startDate]).to.deep.equal([100, '2026-01-01']);
    });

    it('annuls amendments in the reverse order of their activation', async () => {
        await policy('a-4');
        const first = await activate(await propose('a-4', '2026-07-01', 110));
        const second = await activate(await propose('a-4', '2027-01-01', 120));
        expect((await errorOf(move(first, 'annul'))).code).to.equal('conflict');
        await move(second, 'annul');
        await move(first, 'annul');
        expect((await read('a-4')).data.body.premium).to.equal(100);
    });

    it('refuses to activate an amendment dated before the last version, leaving everything as it was', async () => {
        await policy('a-5');
        const early = await issue(await propose('a-5', '2025-12-31', 90));
        expect((await errorOf(move(early, 'activate'))).code).to.equal('conflict');
        const unchanged = await read('a-5');
        expect([unchanged.data.body.premium, unchanged.data['amendment-ledger'].open]).to.deep.equal([100, 'a-5-001']);
        expect((await invoke(RAISE, 'read', { businessKey: 'a-5-001' })).data.state.status).to.equal('issued');
    });

    it('lets only the process of the amendment type move its version status along pending, applied and discarded', async () => {
        await policy('a-6');
        const proposed = await propose('a-6', '2026-07-01', 110);
        expect(proposed.data.state).to.deep.equal({ status: 'draft', versionStatus: 'pending' });
        const applied = await activate(proposed);
        expect(applied.data.state).to.deep.equal({ status: 'active', versionStatus: 'applied' });
        expect((await move(applied, 'annul')).data.state).to.deep.equal({ status: 'annulled', versionStatus: 'discarded' });
        const other = await propose('a-6', '2026-08-01', 120);
        const discarded = await move(other, 'cancel');
        expect(discarded.data.state).to.deep.equal({ status: 'cancelled', versionStatus: 'discarded' });
    });

    it('refuses an amendment created other than through the entity it amends, and a start of a ledger write', async () => {
        const link = { sourceType: POLICY, sourceKey: 'a-5', sourceRevision: 1, generator: 'amendments', declaration: RAISE, context: { effectiveFrom: '2026-07-01' } };
        const direct = await errorOf(invoke(RAISE, 'create', { businessKey: 'direct', traits: { body: { reason: 'x', changes: { premium: 1 } }, generated: link } }));
        expect([direct.code, direct.message]).to.deep.equal(['forbidden', 'a generated entity is created through the entity that generates it']);
        const forged = await errorOf(invoke(POLICY, 'enter', { businessKey: 'a-1', trait: 'amendments', process: 'write', entityOperation: 'write', input: { command: 'reset', value: { last: 0, open: null } } }));
        expect(forged.code).to.equal('private-operation');
    });

    it('proposes an amendment of a shape of its own, checked against the input of its declaration', async () => {
        await policy('a-7');
        const error = await errorOf(propose('a-7', '2026-07-01', undefined, RAISE, { reason: 'indexation', changes: { premium: 'high' } }));
        expect(error.code).to.equal('invalid');
        const proposed = await propose('a-7', '2026-07-01', 110);
        expect([proposed.data.body, proposed.data.generated]).to.deep.equal([
            { reason: 'indexation', changes: { premium: 110 } },
            { sourceType: POLICY, sourceKey: 'a-7', sourceRevision: (await read('a-7')).revision, generator: 'amendments', declaration: RAISE, context: { effectiveFrom: '2026-07-01' } }
        ]);
    });

    it('copies the last version into an amendment of a declaration with the defaults, and applies it from the date of the amendment', async () => {
        await policy('a-8');
        const proposed = await propose('a-8', '2026-07-01', undefined, COPY, { holder: 'Ada', startDate: '2026-01-01', premium: 130 });
        expect(proposed.data.body.premium).to.equal(130);
        await activate(proposed);
        expect(await read('a-8').then(({ data }) => [data.body.premium, data.body.startDate])).to.deep.equal([130, '2026-07-01']);
    });

    it('previews the commands an amendment writes, writing nothing', async () => {
        await policy('a-9');
        const proposed = await propose('a-9', '2026-07-01', 110);
        const before = await read('a-9');
        const commands = await invoke(RAISE, 'preview', { businessKey: proposed.businessKey, effect: 'apply' });
        expect(commands.map(({ key, command }) => [key, command])).to.deep.equal([['body', 'amend'], ['amendment-ledger', 'close']]);
        expect(await read('a-9')).to.deep.equal(before);
        await activate(proposed);
        expect((await read('a-9')).data.body).to.deep.equal({ holder: 'Ada', startDate: '2026-07-01', premium: 110 });
    });

    it('moves the state in the same change as the body, and moves it back when the amendment is annulled', async () => {
        await policy('a-11');
        const before = await read('a-11');
        const proposed = await propose('a-11', '2026-07-01', undefined, END, { reason: 'lapsed' });
        const preview = await invoke(END, 'preview', { businessKey: proposed.businessKey, effect: 'apply' });
        expect(preview.map(({ key, command }) => [key, command])).to.deep.equal([['body', 'amend'], ['state', 'cancel'], ['amendment-ledger', 'close']]);
        const ended = await activate(proposed);
        const cancelled = await read('a-11');
        expect([cancelled.data.state.status, cancelled.data.body.endDate, cancelled.revision]).to.deep.equal(['cancelled', '2026-07-01', before.revision + 2]);
        expect((await errorOf(propose('a-11', '2026-08-01', 120))).code).to.equal('conflict');
        await move(ended, 'annul');
        const reactivated = await read('a-11');
        expect([reactivated.data.state.status, reactivated.data.body.endDate]).to.deep.equal(['active', undefined]);
    });

    it('rolls the activation back when the state cannot move', async () => {
        await policy('a-12');
        const proposed = await issue(await propose('a-12', '2026-07-01', undefined, END, { reason: 'lapsed' }));
        const current = await read('a-12');
        await invoke(POLICY, 'transition', { businessKey: 'a-12', revision: current.revision, transition: 'cancel' });
        expect((await errorOf(move(proposed, 'activate'))).code).to.equal('conflict');
        expect((await read('a-12')).data.body.endDate).to.equal(undefined);
    });

    it('refuses to apply an amendment once the entity moved on from the revision it was proposed at', async () => {
        await policy('a-10');
        const proposed = await issue(await propose('a-10', '2026-07-01', 110));
        const current = await read('a-10');
        await invoke(POLICY, 'update', { businessKey: 'a-10', revision: current.revision, value: { holder: 'Grace', startDate: '2026-01-01', premium: 100 } });
        expect((await errorOf(move(proposed, 'activate'))).code).to.equal('conflict');
        expect((await read('a-10')).data.body.holder).to.equal('Grace');
    });

    it('keeps the link of an amendment, which no trait operation writes and no update of the amendment changes', async () => {
        await policy('g-1');
        const proposed = await propose('g-1', '2026-07-01', 110);
        await invoke(RAISE, 'update', { businessKey: proposed.businessKey, revision: proposed.revision, value: { reason: 'again', changes: { premium: 120 }, generated: { sourceKey: 'g-2' } } });
        const stored = await invoke(RAISE, 'read', { businessKey: proposed.businessKey });
        expect([stored.data.body.reason, stored.data.generated]).to.deep.equal(['again', proposed.data.generated]);
    });

    it('accepts no write to an entity from anyone but a trait, and no start of a process of a trait that no kind declares', async () => {
        await policy('g-2');
        await policy('g-3');
        const pending = await propose('g-2', '2026-07-01', 112);
        const stray = await errorOf(invoke(POLICY, 'write', { businessKey: 'g-3', entityOperation: 'amendments/apply', operations: [{ key: 'body', operation: 'remove', input: {} }] }));
        expect(stray.code).to.equal('forbidden');
        const direct = await errorOf(invoke(POLICY, 'enter', { businessKey: 'g-2', trait: 'amendments', process: 'apply', entityOperation: 'apply', input: { amendment: pending } }));
        expect(direct.code).to.equal('private-operation');
        expect([(await read('g-2')).data.body.premium, (await read('g-3')).data.body.premium]).to.deep.equal([100, 100]);
    });

    it('generates entities of other kinds beside amendments, with no ledger and no context of its own', async () => {
        await policy('a-13');
        const note = await invoke(POLICY, 'generate', { businessKey: 'a-13', generator: 'notes', declaration: 'note', key: 'n-1', input: { text: 'hello' } });
        expect([note.businessKey, note.data.generated.generator, note.data.body]).to.deep.equal(['n-1', 'notes', { text: 'hello' }]);
        expect((await read('a-13')).data['amendment-ledger']).to.deep.equal({ last: 0, open: null });
        const absent = await errorOf(invoke(POLICY, 'generate', { businessKey: 'a-13', generator: 'nothing', declaration: 'note', key: 'n-2', input: { text: 'x' } }));
        expect(absent.code).to.equal('invalid');
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

    it('reports a process that moves the version status against its order, starts it elsewhere than pending or adds a state to it', async () => {
        const broken = {
            id: `${RAISE}-broken`,
            kind: 'amendment-entity-type',
            data: {
                traits: {
                    body: { configuration: { schema: { '!reason': 'string' } } },
                    state: {
                        configuration: {
                            states: { status: { open: true }, versionStatus: { suspended: true } },
                            transitions: { reopen: { versionStatus: { discarded: 'pending' }, status: { open: 'open' } }, undo: { versionStatus: { applied: 'pending' } } },
                            initialStates: { default: { status: 'open' }, applied: { status: 'open', versionStatus: 'applied' } }
                        }
                    }
                }
            }
        };
        expect((await messagesWith([broken])).filter(message => message.startsWith(`${RAISE}-broken`))).to.include.members([
            `${RAISE}-broken: state versionStatus=suspended declares no moves in a dimension that restricts them (to: [] ends it)`,
            `${RAISE}-broken: transition 'reopen' moves versionStatus from discarded to pending, which the dimension does not allow`,
            `${RAISE}-broken: transition 'undo' moves versionStatus from applied to pending, which the dimension does not allow`,
            `${RAISE}-broken: initial state 'applied' starts versionStatus in applied, which the dimension does not allow`
        ]);
    });

    it('reports a mapping of a declaration that reads a field neither the entity, the input nor the amendment has', async () => {
        const broken = declaration('broken', {
            [`${RAISE}-wrong`]: {
                type: RAISE,
                input: `${RAISE}-input`,
                open: { body: { reason: '#.input.why', changes: '#.input.changes', holder: '#.entity.data.body.owner' } },
                effects: { apply: [{ key: 'body', operation: 'amend', input: { validFrom: '#.link.since', ref: '#.generated.nope', body: { '$func/patched-body': { body: { '$func/record-body': '#.source' }, patch: [{ op: 'replace', path: '/premium', value: 1 }] } } } }] }
            }
        });
        const messages = (await messagesWith([broken])).join('\n');
        expect(messages).to.include(`the open mapping of ${RAISE}-wrong`).and.to.include('why').and.to.include('owner').and.to.include(`the apply of ${RAISE}-wrong`).and.to.include('since').and.to.include('nope');
    });

    it('reports a mapping of a declaration whose result does not fit the body it produces', async () => {
        const broken = declaration('misshaped', {
            [`${RAISE}-misshaped`]: {
                type: RAISE,
                open: { body: { reason: 5 } },
                effects: { apply: [{ key: 'body', operation: 'amend', input: { validFrom: '2026-07-01', ref: AMENDMENT_KEY, body: { holder: 'Ada', premium: 'high', nope: 1 } } }] }
            }
        });
        const messages = (await messagesWith([broken])).join('\n');
        expect(messages).to.include(`the open mapping of ${RAISE}-misshaped`).and.to.include('reason').and.to.include(`the apply of ${RAISE}-misshaped`).and.to.include('premium').and.to.include('nope');
    });

    it('reports a declaration whose apply changes a trait that its revert leaves, names no trait of the entity or no operation of it', async () => {
        const broken = declaration('unpaired', {
            [`${END}-unpaired`]: {
                type: END,
                effects: {
                    apply: [
                        { key: 'state', operation: 'transition', input: { transition: 'cancel' } },
                        { key: 'ownership', operation: 'put', input: {} },
                        { key: 'body', operation: 'nope', input: {} }
                    ],
                    revert: [{ key: 'body', operation: 'remove', input: { validFrom: VALID_FROM, ref: AMENDMENT_KEY } }]
                }
            }
        });
        const messages = (await messagesWith([broken])).join('\n');
        expect(messages).to.include("changes 'state' and its revert doesn't").and.to.include("has no trait 'ownership'").and.to.include('has no such operation');
    });
});
