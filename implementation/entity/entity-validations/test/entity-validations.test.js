import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const INVOICE = `invoice-${run}`;
const PLAIN = `plain-${run}`;
const MOVING = `moving-${run}`;

const states = {
    states: { status: { draft: true, issued: true } },
    transitions: { issue: { status: { draft: 'issued' }, validity: { valid: true } } },
    initialStates: { default: { status: 'draft' } }
};

const traits = { body: { configuration: { schema: { '!amount': 'number', 'customer': 'string' } } }, validation: { configuration: {} }, state: { configuration: states } };

const elements = [
    { id: INVOICE, kind: 'stateful-body-entity-type', data: { traits } },
    { id: PLAIN, kind: 'body-entity-type', data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, validation: { configuration: {} } } } },
    { id: MOVING, kind: 'stateful-entity-type', data: { traits: { validation: { configuration: {} }, state: { configuration: { ...states, transitions: { fix: { status: { draft: 'draft' }, validity: { invalid: 'valid' } } } } } } } },
    { id: `${PLAIN}-positive`, kind: 'slot-fill', data: { target: PLAIN, slot: 'validations', value: { $if: [{ $gt: ['#.data.body.amount', 0] }, {}, { amount: 'must be positive' }] } } },
    { id: `${INVOICE}-positive`, kind: 'slot-fill', data: { target: INVOICE, slot: 'validations', value: { $if: [{ $gt: ['#.data.body.amount', 0] }, {}, { amount: 'must be positive' }] } } },
    { id: `${INVOICE}-customer`, kind: 'slot-fill', data: { target: INVOICE, slot: 'validations', value: { $if: ['#.data.body.customer', {}, { customer: 'is required' }] } } }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'entity-validations'];

const errorOf = promise => promise.then(() => null, error => error);

describe('entity-validations', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    after(stop);

    it('reports a transition that moves the validity dimension and nothing else', () => {
        const messages = validate().flatMap(({ data }) => data.messages ?? []);
        expect(messages.filter(message => message.includes(MOVING))).to.have.length(1);
        expect(messages.filter(message => !message.includes(MOVING))).to.deep.equal([]);
    });

    it('works without a state trait', async () => {
        const created = await invoke(PLAIN, 'create', { businessKey: 'p-1', traits: { body: { amount: 0 } } });
        expect(created.data.validation).to.deep.equal({ amount: 'must be positive' });
        expect(created.data.state).to.equal(undefined);
    });

    it('records the errors and marks the entity invalid on create', async () => {
        const created = await invoke(INVOICE, 'create', { businessKey: 'i-1', traits: { body: { amount: 0 } } });
        expect(created.data.validation).to.deep.equal({ amount: 'must be positive', customer: 'is required' });
        expect(created.data.state).to.deep.equal({ status: 'draft', validity: 'invalid' });
    });

    it('blocks a transition that needs a valid entity until the errors are fixed', async () => {
        await invoke(INVOICE, 'create', { businessKey: 'i-2', traits: { body: { amount: 5 } } });
        const blocked = await errorOf(invoke(INVOICE, 'transition', { businessKey: 'i-2', revision: 1, transition: 'issue' }));
        expect(blocked.code).to.equal('conflict');
        const fixed = await invoke(INVOICE, 'update', { businessKey: 'i-2', revision: 1, value: { amount: 5, customer: 'acme' } });
        expect([fixed.data.validation, fixed.data.state.validity]).to.deep.equal([{}, 'valid']);
        const issued = await invoke(INVOICE, 'transition', { businessKey: 'i-2', revision: fixed.revision, transition: 'issue' });
        expect(issued.data.state).to.deep.equal({ status: 'issued', validity: 'valid' });
    });

    it('takes no validation as input', async () => {
        const given = await errorOf(invoke(INVOICE, 'create', { businessKey: 'i-3', traits: { body: { amount: 1, customer: 'acme' }, validation: {} } }));
        expect(given.code).to.equal('invalid');
    });
});
