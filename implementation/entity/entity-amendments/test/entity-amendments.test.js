import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const POLICY = `policy-${run}`;
const RAISE = `raise-${run}`;

const elements = [
    {
        id: POLICY,
        kind: 'versioned-entity-type',
        data: {
            traits: {
                body: { configuration: { schema: { '!holder': 'string', '!startDate': '@date', '!premium': 'number' }, versioned: { validFrom: '/startDate' } } },
                state: {
                    configuration: {
                        states: { status: { draft: true, active: true } },
                        transitions: { activate: { status: { draft: 'active' } } },
                        initialStates: { default: { status: 'draft' } },
                        operations: { applyAmendment: { status: { active: true } } }
                    }
                }
            }
        }
    },
    {
        id: RAISE,
        kind: 'amendment-entity-type',
        data: {
            traits: {
                body: { configuration: { schema: { '$data#&': ['@amendment-entity-body', { '!reason': 'string' }] } } },
                state: {
                    configuration: {
                        states: { status: { draft: true, issued: true, active: true, cancelled: true, annulled: true } },
                        transitions: {
                            issue: { status: { draft: 'issued' } },
                            activate: { status: { issued: 'active' }, versionStatus: { pending: 'applied' } },
                            cancel: { status: { draft: 'cancelled', issued: 'cancelled' }, versionStatus: { pending: 'discarded' } },
                            annul: { status: { active: 'annulled' }, versionStatus: { applied: 'discarded' } },
                            reopen: { versionStatus: { discarded: 'pending' } }
                        },
                        initialStates: { default: { status: 'draft' } }
                    }
                }
            }
        }
    },
    { id: `${POLICY}-raise`, kind: 'slot-fill', data: { target: POLICY, slot: 'amendmentTypes', value: RAISE } }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'entity-relations', 'entity-relations-postgresql', 'entity-amendments'];

const errorOf = promise => promise.then(() => null, error => error);

const policy = async (businessKey, { activate = true } = {}) => {
    const created = await invoke(POLICY, 'create', { businessKey, traits: { body: { holder: 'Ada', startDate: '2026-01-01', premium: 100 } } });
    return activate ? invoke(POLICY, 'transition', { businessKey, revision: created.revision, transition: 'activate' }) : created;
};

const premium = (value) => [{ op: 'replace', path: '/premium', value }];

const propose = (businessKey, effectiveFrom, value, amendmentType = RAISE) => invoke('entity-amendments', 'propose', {
    entityType: POLICY, businessKey, amendmentType, effectiveFrom, patch: premium(value), data: { reason: 'indexation' }
});

const move = (amendment, transition) => invoke(RAISE, 'transition', { businessKey: amendment.businessKey, revision: amendment.revision, transition });

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
        expect((await errorOf(invoke('entity-amendments', 'propose', { entityType: POLICY, businessKey: 'a-1', amendmentType: `${RAISE}-other`, effectiveFrom: '2026-07-01', patch: [] }))).code).to.equal('invalid');
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

    it('refuses a transition that moves the version status against its order', async () => {
        await policy('a-7');
        const proposed = await propose('a-7', '2026-07-01', 110);
        const cancelled = await move(proposed, 'cancel');
        expect(cancelled.data.state.versionStatus).to.equal('discarded');
        const error = await errorOf(invoke(RAISE, 'transition', { businessKey: cancelled.businessKey, revision: cancelled.revision, transition: 'reopen' }));
        expect([error.code, error.message]).to.deep.equal(['invalid', "an amendment can't go from discarded to pending"]);
    });

    it('refuses an amendment created other than through the entity it amends, and a ledger write that is no command of it', async () => {
        const direct = await errorOf(invoke(RAISE, 'create', { businessKey: 'direct', traits: { body: { amendedType: POLICY, amendedKey: 'a-5', effectiveFrom: '2026-07-01', patch: [], reason: 'x' } } }));
        expect([direct.code, direct.message]).to.deep.equal(['forbidden', 'amendments are proposed through the entity they amend']);
        const current = await read('a-1');
        const ledger = await errorOf(invoke(POLICY, 'writeLedger', { businessKey: 'a-1', revision: current.revision, command: 'reset', value: { last: 0, open: null } }));
        expect([ledger.code, ledger.message]).to.deep.equal(['invalid', 'the amendment ledger has no command reset']);
    });
});
