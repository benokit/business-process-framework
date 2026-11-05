import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const POLICY = `policy-${run}`;
const RAISE = `raise-${run}`;
const COPY = `copy-${run}`;
const END = `end-${run}`;
const BODY = { '!holder': 'string', '!startDate': '@date', '!premium': 'number', endDate: '@date', '*': 'never' };
const VALID_FROM = '#.link.effectiveFrom';

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

const elements = [
    {
        id: POLICY,
        kind: 'versioned-entity-type',
        data: {
            traits: {
                body: { trait: 'versioned-body', configuration: { schema: BODY, versioned: { validFrom: '/startDate' } } },
                state: {
                    configuration: {
                        states: { status: { draft: true, active: true, cancelled: true } },
                        transitions: { activate: { status: { draft: 'active' } }, cancel: { status: { active: 'cancelled' } }, reactivate: { status: { cancelled: 'active' } } },
                        initialStates: { default: { status: 'draft' } },
                        operations: { applyAmendment: { status: { active: true } } }
                    }
                }
            }
        }
    },
    amendmentType(RAISE, { '!reason': 'string', '!changes': { '!premium': 'number' } }),
    amendmentType(COPY, BODY),
    amendmentType(END, { '!reason': 'string' }),
    { id: `${RAISE}-input`, kind: 'schema', data: { '!reason': 'string', '!changes': { '!premium': 'number' }, '*': 'never' } },
    {
        id: `${POLICY}-raise`,
        kind: 'slot-fill',
        data: {
            target: POLICY,
            slot: 'amendmentTypes',
            value: {
                type: RAISE,
                input: `${RAISE}-input`,
                open: { reason: '#.input.reason', changes: '#.input.changes' },
                apply: [{
                    key: 'body',
                    operation: 'amend',
                    input: { validFrom: VALID_FROM, body: { '$func/patched-body': { body: '#.body', patch: [{ op: 'replace', path: '/premium', value: '#.amendment.data.body.changes.premium' }] } } }
                }]
            }
        }
    },
    {
        id: `${POLICY}-end`,
        kind: 'slot-fill',
        data: {
            target: POLICY,
            slot: 'amendmentTypes',
            value: {
                type: END,
                open: { reason: '#.input.reason' },
                apply: [
                    { key: 'body', operation: 'amend', input: { validFrom: VALID_FROM, body: { '$func/patched-body': { body: '#.body', patch: [{ op: 'add', path: '/endDate', value: VALID_FROM }] } } } },
                    { key: 'state', operation: 'transition', input: { transition: 'cancel' } }
                ],
                revert: [
                    { key: 'body', operation: 'remove', input: { validFrom: VALID_FROM } },
                    { key: 'state', operation: 'transition', input: { transition: 'reactivate' } }
                ]
            }
        }
    },
    { id: `${POLICY}-copy`, kind: 'slot-fill', data: { target: POLICY, slot: 'amendmentTypes', value: COPY } }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'entity-relations', 'entity-relations-postgresql', 'entity-amendments'];

const errorOf = promise => promise.then(() => null, error => error);

const policy = async (businessKey, { activate = true } = {}) => {
    const created = await invoke(POLICY, 'create', { businessKey, traits: { body: { holder: 'Ada', startDate: '2026-01-01', premium: 100 } } });
    return activate ? invoke(POLICY, 'transition', { businessKey, revision: created.revision, transition: 'activate' }) : created;
};

const propose = (businessKey, effectiveFrom, value, amendmentType = RAISE, input = { reason: 'indexation', changes: { premium: value } }) => invoke('entity-amendments', 'propose', {
    entityType: POLICY, businessKey, amendmentType, effectiveFrom, input
});

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
        expect((await errorOf(invoke('entity-amendments', 'propose', { entityType: POLICY, businessKey: 'a-1', amendmentType: `${RAISE}-other`, effectiveFrom: '2026-07-01' }))).code).to.equal('invalid');
        const proposed = await propose('a-1', '2026-07-01', 110);
        expect([proposed.businessKey, proposed.data.state.status, proposed.data.body.reason]).to.deep.equal(['a-1-001', 'draft', 'indexation']);
        expect((await read('a-1')).data['amendment-ledger']).to.deep.equal({ last: 1, open: 'a-1-001' });
    });

    it('proposes an amendment for an entity type named by an instanceOf reference', async () => {
        await policy('a-ref');
        const proposed = await invoke('entity-amendments', 'propose', {
            entityType: { instanceOf: 'versioned-entity-type' }, businessKey: 'a-ref', amendmentType: RAISE, effectiveFrom: '2026-07-01', input: { reason: 'indexation', changes: { premium: 110 } }
        });
        expect([proposed.businessKey, proposed.data['amendment-link'].amendedType]).to.deep.equal(['a-ref-001', POLICY]);
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
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, broken] });
        const messages = validate().flatMap(problem => problem.message.replace(/^state: /, '').split('; ')).filter(message => message.startsWith(`${RAISE}-broken`));
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
        expect(messages).to.include.members([
            `${RAISE}-broken: state versionStatus=suspended declares no moves in a dimension that restricts them (to: [] ends it)`,
            `${RAISE}-broken: transition 'reopen' moves versionStatus from discarded to pending, which the dimension does not allow`,
            `${RAISE}-broken: transition 'undo' moves versionStatus from applied to pending, which the dimension does not allow`,
            `${RAISE}-broken: initial state 'applied' starts versionStatus in applied, which the dimension does not allow`
        ]);
    });

    it('reports a mapping of a fill that reads a field neither the entity, the input nor the amendment has', async () => {
        const broken = {
            id: `${POLICY}-broken`,
            kind: 'slot-fill',
            data: {
                target: POLICY,
                slot: 'amendmentTypes',
                value: { type: RAISE, input: `${RAISE}-input`, open: { reason: '#.input.why', changes: '#.input.changes', holder: '#.entity.data.body.owner' }, apply: [{ key: 'body', operation: 'amend', input: { validFrom: '#.link.since', body: { holder: '#.body.nope', premium: '#.amendment.data.amendment-link.since' } } }] }
            }
        };
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, broken] });
        const messages = validate().map(problem => problem.message);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
        expect(messages.join('\n')).to.include('the open mapping of ' + RAISE).and.to.include('why').and.to.include('owner').and.to.include('the apply of ' + RAISE).and.to.include('since').and.to.include('nope');
    });

    it('reports a mapping of a fill whose result does not fit the body it produces', async () => {
        const broken = {
            id: `${POLICY}-misshaped`,
            kind: 'slot-fill',
            data: {
                target: POLICY,
                slot: 'amendmentTypes',
                value: { type: RAISE, open: { reason: 5 }, apply: [{ key: 'body', operation: 'amend', input: { validFrom: '2026-07-01', body: { holder: 'Ada', premium: 'high', nope: 1 } } }] }
            }
        };
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, broken] });
        const messages = validate().map(problem => problem.message).join('\n');
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
        expect(messages).to.include('the open mapping of ' + RAISE).and.to.include('reason').and.to.include('changes')
            .and.to.include('the apply of ' + RAISE).and.to.include('premium').and.to.include('startDate').and.to.include('nope');
    });

    it('refuses an amendment created other than through the entity it amends, and a ledger write that is no command of it', async () => {
        const direct = await errorOf(invoke(RAISE, 'create', { businessKey: 'direct', traits: { body: { reason: 'x', changes: { premium: 1 } }, 'amendment-link': { amendedType: POLICY, amendedKey: 'a-5', amendedRevision: 1, effectiveFrom: '2026-07-01' } } }));
        expect([direct.code, direct.message]).to.deep.equal(['forbidden', 'amendments are proposed through the entity they amend']);
        const current = await read('a-1');
        const ledger = await errorOf(invoke(POLICY, 'writeLedger', { businessKey: 'a-1', revision: current.revision, command: 'reset', value: { last: 0, open: null } }));
        expect([ledger.code, ledger.message]).to.deep.equal(['invalid', 'the amendment ledger has no command reset']);
    });

    it('proposes an amendment of a shape of its own, checked against the input of its fill', async () => {
        await policy('a-7');
        const error = await errorOf(invoke('entity-amendments', 'propose', { entityType: POLICY, businessKey: 'a-7', amendmentType: RAISE, effectiveFrom: '2026-07-01', input: { reason: 'indexation', changes: { premium: 'high' } } }));
        expect(error.code).to.equal('invalid');
        const proposed = await propose('a-7', '2026-07-01', 110);
        expect([proposed.data.body, proposed.data['amendment-link']]).to.deep.equal([
            { reason: 'indexation', changes: { premium: 110 } },
            { amendedType: POLICY, amendedKey: 'a-7', amendedRevision: (await read('a-7')).revision, effectiveFrom: '2026-07-01' }
        ]);
    });

    it('copies the last version into an amendment of a fill that is a bare reference, and applies it from the date of the amendment', async () => {
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
        const commands = await invoke(RAISE, 'preview', { businessKey: proposed.businessKey });
        expect(commands).to.have.length(1);
        expect([commands[0].key, commands[0].command]).to.deep.equal(['body', 'amend']);
        expect(await read('a-9')).to.deep.equal(before);
        await activate(proposed);
        expect((await read('a-9')).data.body).to.deep.equal({ holder: 'Ada', startDate: '2026-07-01', premium: 110 });
    });

    it('moves the state in the same change as the body, and moves it back when the amendment is annulled', async () => {
        await policy('a-11');
        const before = await read('a-11');
        const proposed = await propose('a-11', '2026-07-01', undefined, END, { reason: 'lapsed' });
        const preview = await invoke(END, 'preview', { businessKey: proposed.businessKey });
        expect(preview.map(({ key, command }) => [key, command])).to.deep.equal([['body', 'amend'], ['state', 'cancel']]);
        const ended = await activate(proposed);
        const cancelled = await read('a-11');
        expect([cancelled.data.state.status, cancelled.data.body.endDate, cancelled.revision]).to.deep.equal(['cancelled', '2026-07-01', before.revision + 3]);
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

    it('reports a fill whose apply changes a trait that its revert leaves, names no trait of the entity or no operation of it', async () => {
        const broken = {
            id: `${POLICY}-unpaired`,
            kind: 'slot-fill',
            data: {
                target: POLICY,
                slot: 'amendmentTypes',
                value: {
                    type: END,
                    apply: [
                        { key: 'state', operation: 'transition', input: { transition: 'cancel' } },
                        { key: 'ownership', operation: 'put', input: {} },
                        { key: 'body', operation: 'nope', input: {} }
                    ],
                    revert: [{ key: 'body', operation: 'remove', input: { validFrom: '#.link.effectiveFrom' } }]
                }
            }
        };
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, broken] });
        const messages = validate().map(problem => problem.message).join('\n');
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
        expect(messages).to.include("changes 'state' and its revert doesn't").and.to.include("has no trait 'ownership'").and.to.include("has no such operation");
    });

    it('refuses to apply an amendment once the entity moved on from the revision it was proposed at', async () => {
        await policy('a-10');
        const proposed = await issue(await propose('a-10', '2026-07-01', 110));
        const current = await read('a-10');
        await invoke(POLICY, 'update', { businessKey: 'a-10', revision: current.revision, value: { holder: 'Grace', startDate: '2026-01-01', premium: 100 } });
        expect((await errorOf(move(proposed, 'activate'))).code).to.equal('conflict');
        expect((await read('a-10')).data.body.holder).to.equal('Grace');
    });
});
