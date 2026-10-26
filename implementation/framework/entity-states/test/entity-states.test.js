import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const ORDER = `order-${run}`;
const NOTE = `note-${run}`;

const lifecycle = {
    states: { status: ['draft', 'confirmed', 'cancelled'] },
    transitions: {
        confirm: { from: { status: ['draft'] }, to: { status: 'confirmed' } },
        cancel: { from: { status: ['draft', 'confirmed'] }, to: { status: 'cancelled' } }
    },
    initialStates: { default: { status: 'draft' }, confirmed: { status: 'confirmed' } }
};

const elements = [
    { id: ORDER, kind: 'entity-type', data: { bodySchema: { '!amount': 'number' } } },
    { id: `${ORDER}-lifecycle`, kind: 'slot-fill', data: { target: ORDER, slot: 'traits', value: { trait: 'state', configuration: lifecycle } } },
    { id: NOTE, kind: 'entity-type', data: { bodySchema: { '!text': 'string' } } }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states'];

const errorOf = promise => promise.then(() => null, error => error);

const transition = (businessKey, name, revision, entityType = ORDER) => invoke('entity-states', 'transition', { entityType, businessKey, revision, transition: name });

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
        expect((await invoke(ORDER, 'create', { businessKey: 's-1', body: { amount: 1 } })).data.state).to.deep.equal({ status: 'draft' });
        expect((await invoke(ORDER, 'create', { businessKey: 's-2', body: { amount: 1 }, traits: { state: 'confirmed' } })).data.state).to.deep.equal({ status: 'confirmed' });
        expect((await errorOf(invoke(ORDER, 'create', { businessKey: 's-3', body: { amount: 1 }, traits: { state: 'shipped' } }))).code).to.equal('invalid');
    });

    it('transitions along the states model, keeping the body', async () => {
        await invoke(ORDER, 'create', { businessKey: 's-4', body: { amount: 7 } });
        expect((await errorOf(transition('s-4', 'confirm'))).code).to.equal('invalid');
        const confirmed = await transition('s-4', 'confirm', 1);
        expect([confirmed.revision, confirmed.data]).to.deep.equal([2, { body: { amount: 7 }, state: { status: 'confirmed' } }]);
        expect((await errorOf(transition('s-4', 'confirm', 2))).code).to.equal('conflict');
        expect((await errorOf(transition('s-4', 'ship', 2))).code).to.equal('invalid');
    });

    it('leaves entity types without a states model stateless', async () => {
        expect((await invoke(NOTE, 'create', { businessKey: 'n-1', body: { text: 'hi' } })).data).to.deep.equal({ body: { text: 'hi' } });
        expect((await errorOf(transition('n-1', 'confirm', 1, NOTE))).code).to.equal('invalid');
        expect((await errorOf(transition('n-1', 'confirm', 1, 'entity-states'))).code).to.equal('not-found');
    });

    it('reports a states model with undeclared states in validate()', async () => {
        const broken = { id: `${ORDER}-broken`, kind: 'slot-fill', data: { target: NOTE, slot: 'traits', value: { trait: 'state', configuration: { states: { status: ['a'] }, initialStates: { default: { status: 'b' } } } } } };
        await stop();
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: [...elements, broken] });
        expect(validate().map(problem => problem.message)).to.deep.equal([`state: ${NOTE}: initial state 'default' uses undeclared state status=b`]);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });
});
