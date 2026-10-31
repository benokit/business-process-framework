import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { applyTransition } from '../src/states.js';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const ORDER = `order-${run}`;
const NOTE = `note-${run}`;

const lifecycle = {
    states: { status: { draft: true, confirmed: true, cancelled: true } },
    transitions: {
        confirm: { status: { draft: 'confirmed' } },
        cancel: { status: { draft: 'cancelled', confirmed: 'cancelled' } }
    },
    initialStates: { default: { status: 'draft' }, confirmed: { status: 'confirmed' } },
    operations: { body: { status: { draft: true } }, delete: { status: { draft: true, cancelled: true } } }
};

const elements = [
    { id: ORDER, kind: 'stateful-entity-type', data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } } } } },
    { id: `${ORDER}-lifecycle`, kind: 'slot-fill', data: { target: ORDER, slot: 'traits', value: { trait: 'state', configuration: lifecycle } } },
    { id: NOTE, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!text': 'string' } } } } } }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states'];

const errorOf = promise => promise.then(() => null, error => error);

const transition = (businessKey, name, revision, entityType = ORDER) => invoke(entityType, 'transition', { businessKey, revision, transition: name });

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

    it('starts in the default or a named initial state', async () => {
        expect((await invoke(ORDER, 'create', { businessKey: 's-1', traits: { body: { amount: 1 } } })).data.state).to.deep.equal({ status: 'draft' });
        expect((await invoke(ORDER, 'create', { businessKey: 's-2', traits: { body: { amount: 1 }, state: 'confirmed' } })).data.state).to.deep.equal({ status: 'confirmed' });
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 's-3', traits: { body: { amount: 1 }, state: 'shipped' } }))).code).to.equal('invalid');
    });

    it('transitions along the states model, keeping the body', async () => {
        await invoke(ORDER, 'create', { businessKey: 's-4', traits: { body: { amount: 7 } } });
        expect((await errorOf(transition('s-4', 'confirm'))).code).to.equal('invalid');
        const confirmed = await transition('s-4', 'confirm', 1);
        expect([confirmed.revision, confirmed.data]).to.deep.equal([2, { body: { amount: 7 }, state: { status: 'confirmed' } }]);
        expect((await errorOf(transition('s-4', 'confirm', 2))).code).to.equal('conflict');
        expect((await errorOf(transition('s-4', 'ship', 2))).code).to.equal('invalid');
    });

    it('allows an entity operation only in the states its declaration lists', async () => {
        const put = (businessKey, revision, amount) => invoke(ORDER, 'update', { businessKey, revision, value: { amount } });
        await invoke(ORDER, 'create', { businessKey: 'o-1', traits: { body: { amount: 1 } } });
        const changed = await put('o-1', 1, 2);
        expect(changed.data.body.amount).to.equal(2);
        const confirmed = await transition('o-1', 'confirm', changed.revision);
        const refused = await errorOf(put('o-1', confirmed.revision, 3));
        expect([refused.code, refused.message]).to.deep.equal(['conflict', `${ORDER} doesn't allow trait body in its current state`]);
        expect((await errorOf(invoke(ORDER, 'delete', { businessKey: 'o-1', revision: confirmed.revision }))).code).to.equal('conflict');
        const cancelled = await transition('o-1', 'cancel', confirmed.revision);
        expect((await invoke(ORDER, 'delete', { businessKey: 'o-1', revision: cancelled.revision })).businessKey).to.equal('o-1');
    });

    it('leaves entity types without a states model stateless', async () => {
        expect((await invoke(NOTE, 'create', { businessKey: 'n-1', traits: { body: { text: 'hi' } } })).data).to.deep.equal({ body: { text: 'hi' } });
        expect((await errorOf(transition('n-1', 'confirm', 1, NOTE))).code).to.equal('unknown-operation');
    });

    it('reports a states model with undeclared states in validate()', async () => {
        const broken = { id: `${ORDER}-broken`, kind: 'slot-fill', data: { target: NOTE, slot: 'traits', value: { trait: 'state', configuration: { states: { status: { a: true } }, initialStates: { default: { status: 'b' } }, operations: { amend: { status: { a: true } }, delete: { status: { z: true } } } } } } };
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, broken] });
        expect(validate().map(problem => problem.message)).to.deep.equal([[
            `state: ${NOTE}: has states and exposes no transition operation`,
            `${NOTE}: operation 'amend' is neither delete nor a trait other than state`,
            `${NOTE}: operation 'delete' uses undeclared state status=z`,
            `${NOTE}: initial state 'default' uses undeclared state status=b`
        ].join('; ')]);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
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
});
