import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { applyTransition, stateMoved } from '../src/states.js';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const ORDER = `order-${run}`;
const NOTE = `note-${run}`;
const TICKET = `ticket-${run}`;
const CHECK = `check-${run}`;

const lifecycle = {
    states: { status: { draft: true, confirmed: true, cancelled: true } },
    transitions: {
        confirm: { status: { draft: 'confirmed' } },
        cancel: { status: { draft: 'cancelled', confirmed: 'cancelled' } }
    },
    initialStates: { default: { status: 'draft' }, confirmed: { status: 'confirmed' } },
    operations: { update: { status: { draft: true } }, delete: { status: { draft: true, cancelled: true } } }
};

const elements = [
    { id: ORDER, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } } } } },
    { id: `${ORDER}-lifecycle`, kind: 'slot-fill', data: { target: ORDER, slot: 'traits', value: { trait: 'state', configuration: lifecycle } } },
    { id: TICKET, kind: 'entity-type', data: { traits: { state: { configuration: { ...lifecycle, operations: { delete: lifecycle.operations.delete } } } } } },
    { id: NOTE, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!text': 'string' } } } } } }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states'];

const errorOf = promise => promise.then(() => null, error => error);

const transition = (businessKey, name, revision, entityType = ORDER) => invoke(entityType, 'run', { businessKey, revision, trait: 'state', operation: 'transition', input: { transition: name } });

describe('entity-states', function () {
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

    it('moves an entity without a body and gives it no update', async () => {
        const created = await invoke(TICKET, 'create', { businessKey: 't-1' });
        expect(created.data).to.deep.equal({ 'business-key': 't-1', state: { status: 'draft' } });
        expect((await transition('t-1', 'confirm', 1, TICKET)).data).to.deep.equal({ 'business-key': 't-1', state: { status: 'confirmed' } });
        expect((await errorOf(invoke(TICKET, 'run', { businessKey: 't-1', revision: 2, trait: 'body', operation: 'update', input: { value: {} } }))).code).to.equal('private-operation');
    });

    it('starts in the default or a named initial state', async () => {
        expect((await invoke(ORDER, 'create', { businessKey: 's-1', traits: { body: { amount: 1 } } })).data.state).to.deep.equal({ status: 'draft' });
        expect((await invoke(ORDER, 'create', { businessKey: 's-2', traits: { body: { amount: 1 }, state: 'confirmed' } })).data.state).to.deep.equal({ status: 'confirmed' });
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 's-3', traits: { body: { amount: 1 }, state: 'shipped' } }))).code).to.equal('invalid');
    });

    it('transitions along the states model, keeping the body', async () => {
        await invoke(ORDER, 'create', { businessKey: 's-4', traits: { body: { amount: 7 } } });
        expect((await errorOf(transition('s-4', 'confirm'))).code).to.equal('invalid');
        const confirmed = await transition('s-4', 'confirm', 1);
        expect([confirmed.revision, confirmed.data]).to.deep.equal([2, { 'business-key': 's-4', body: { amount: 7 }, state: { status: 'confirmed' } }]);
        expect((await errorOf(transition('s-4', 'confirm', 2))).code).to.equal('conflict');
        expect((await errorOf(transition('s-4', 'ship', 2))).code).to.equal('invalid');
    });

    it('allows an entity operation only in the states its declaration lists', async () => {
        const put = (businessKey, revision, amount) => invoke(ORDER, 'run', { businessKey, revision, trait: 'body', operation: 'update', input: { value: { amount } } });
        await invoke(ORDER, 'create', { businessKey: 'o-1', traits: { body: { amount: 1 } } });
        const changed = await put('o-1', 1, 2);
        expect(changed.data.body.amount).to.equal(2);
        const confirmed = await transition('o-1', 'confirm', changed.revision);
        const refused = await errorOf(put('o-1', confirmed.revision, 3));
        expect([refused.code, refused.message]).to.deep.equal(['conflict', `${ORDER} doesn't allow update in its current state`]);
        expect((await errorOf(invoke(ORDER, 'delete', { businessKey: 'o-1', revision: confirmed.revision }))).code).to.equal('conflict');
        const cancelled = await transition('o-1', 'cancel', confirmed.revision);
        expect((await invoke(ORDER, 'delete', { businessKey: 'o-1', revision: cancelled.revision })).businessKey).to.equal('o-1');
    });

    it('reports an operation literal that no entity type has, in a pipeline that asks whether a state forbids it', async () => {
        const asking = name => ({ id: `${CHECK}-${name}`, kind: 'kind', data: { operations: { run: { input: '@any', output: 'boolean', implementation: [{ set: { '$func/state-forbids-operation': { entityType: ORDER, entityOperation: name, state: { status: 'confirmed' } } } }] } } } });
        const instance = name => ({ id: `${CHECK}-${name}-instance`, kind: `${CHECK}-${name}`, data: {} });
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, asking('update'), instance('update'), asking('updat'), instance('updat')] });
        const problems = validate();
        expect(problems.map(problem => problem.code)).to.deep.equal(['type-mismatch']);
        expect(problems[0].message).to.include(`${CHECK}-updat operations.run.implementation[0].set.$func/state-forbids-operation.entityOperation: the argument.entityOperation is "updat"`);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    it('leaves entity types without a states model stateless', async () => {
        expect((await invoke(NOTE, 'create', { businessKey: 'n-1', traits: { body: { text: 'hi' } } })).data).to.deep.equal({ 'business-key': 'n-1', body: { text: 'hi' } });
        expect((await errorOf(transition('n-1', 'confirm', 1, NOTE))).code).to.equal('private-operation');
    });

    it('reports a states model with undeclared states in validate()', async () => {
        const broken = { id: `${ORDER}-broken`, kind: 'slot-fill', data: { target: NOTE, slot: 'traits', value: { trait: 'state', configuration: { states: { status: { a: true } }, initialStates: { default: { status: 'b' } }, operations: { amend: { status: { a: true } }, delete: { status: { z: true } } } } } } };
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, broken] });
        expect(validate().map(problem => problem.message)).to.deep.equal([[
            `state: ${NOTE}: operation 'amend' is no operation the entity type exposes nor a write of one of its traits (<trait key>/<name>), other than read, create, transition`,
            `${NOTE}: operation 'delete' uses undeclared state status=z`,
            `${NOTE}: initial state 'default' uses undeclared state status=b`
        ].join('; ')]);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    describe('a dimension that restricts its moves', () => {
        const flow = {
            pending: { initial: true, to: ['applied', 'discarded'] },
            applied: { to: ['discarded'] },
            discarded: { to: [] }
        };

        const modelProblems = async configuration => {
            const broken = { id: `${ORDER}-flow`, kind: 'slot-fill', data: { target: NOTE, slot: 'traits', value: { trait: 'state', configuration } } };
            await stop();
            await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, broken] });
            const problems = validate().flatMap(problem => problem.message.replace(/^state: /, '').split('; '));
            await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
            await start();
            await migrate();
            return problems;
        };

        it('accepts transitions and initial states along the declared moves', async () => {
            expect(await modelProblems({
                states: { flow },
                transitions: { apply: { flow: { pending: 'applied' } }, drop: { flow: { pending: 'discarded', applied: 'discarded' } } },
                initialStates: { default: { flow: 'pending' } }
            })).to.deep.equal([]);
        });

        it('reports a transition that moves against the declared moves, and one that leaves a state with none', async () => {
            expect(await modelProblems({
                states: { flow },
                transitions: { reopen: { flow: { applied: 'pending' } }, revive: { flow: { discarded: 'pending' } }, stay: { flow: { applied: 'applied' } } },
                initialStates: { default: { flow: 'pending' } }
            })).to.deep.equal([
                `${NOTE}: transition 'reopen' moves flow from applied to pending, which the dimension does not allow`,
                `${NOTE}: transition 'revive' moves flow from discarded to pending, which the dimension does not allow`
            ]);
        });

        it('reports an initial state in a state not marked initial, a move to an undeclared state and a state without moves', async () => {
            expect(await modelProblems({
                states: { flow: { ...flow, applied: { to: ['discarded', 'lost'] }, suspended: true } },
                initialStates: { default: { flow: 'pending' }, late: { flow: 'applied' } }
            })).to.deep.equal([
                `${NOTE}: state flow=applied leads to undeclared state lost`,
                `${NOTE}: state flow=suspended declares no moves in a dimension that restricts them (to: [] ends it)`,
                `${NOTE}: initial state 'late' starts flow in applied, which the dimension does not allow`
            ]);
        });
    });

    it('moves the dimensions a transition lists together, and only if all allow it', async () => {
        const multi = {
            states: { status: { open: true, closed: true }, payment: { due: true, settled: true } },
            transitions: { close: { status: { open: 'closed' }, payment: { due: 'settled' } } },
            initialStates: { default: { status: 'open', payment: 'due' }, paid: { status: 'open', payment: 'settled' } }
        };
        expect(applyTransition({ model: multi, state: multi.initialStates.default, transition: 'close' })).to.deep.equal({ status: 'closed', payment: 'settled' });
        expect(applyTransition({ model: multi, state: multi.initialStates.paid, transition: 'close' })).to.equal(null);
    });

    it('keeps the state of a dimension whose target is true, and only from the listed sources', () => {
        const guarded = {
            states: { status: { open: true, closed: true }, validity: { valid: true, invalid: true } },
            transitions: { close: { status: { open: 'closed' }, validity: { valid: true } } }
        };
        expect(applyTransition({ model: guarded, state: { status: 'open', validity: 'valid' }, transition: 'close' })).to.deep.equal({ status: 'closed', validity: 'valid' });
        expect(applyTransition({ model: guarded, state: { status: 'open', validity: 'invalid' }, transition: 'close' })).to.equal(null);
    });

    it('tells whether a dimension of the state moved from one value to another', () => {
        const at = status => ({ entityType: ORDER, data: { state: { status } } });
        const moved = (before, after) => stateMoved({ before, after, dimension: 'status', from: 'draft', to: 'confirmed' });
        expect([moved(at('draft'), at('confirmed')), moved(at('draft'), at('draft')), moved(at('confirmed'), at('confirmed')), moved(null, at('confirmed'))]).to.deep.equal([true, false, false, false]);
    });
});
