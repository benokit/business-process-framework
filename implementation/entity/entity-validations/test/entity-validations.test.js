import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const INVOICE = `invoice-${run}`;
const PLAIN = `plain-${run}`;
const STRAY = `stray-${run}`;

const states = {
    states: { status: { draft: true, issued: true }, validity: { valid: true, invalid: true } },
    transitions: {
        markValid: { validity: { valid: 'valid', invalid: 'valid' } },
        markInvalid: { validity: { valid: 'invalid', invalid: 'invalid' } },
        issue: { status: { draft: 'issued' }, validity: { valid: true } }
    },
    initialStates: { default: { status: 'draft', validity: 'valid' } }
};

const onValidation = [{
    key: 'state',
    operation: 'transition',
    input: { transition: { $if: [{ $eq: [{ $count: { collection: { $keys: '#.errors' } } }, 0] }, 'markValid', 'markInvalid'] } }
}];

const traits = {
    body: { configuration: { schema: { '!amount': 'number', 'customer': 'string' } } },
    validation: { configuration: { onValidation } },
    state: { configuration: states }
};

const elements = [
    { id: INVOICE, kind: 'entity-type', data: { traits } },
    { id: PLAIN, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, validation: { configuration: {} } } } },
    {
        id: STRAY,
        kind: 'entity-type',
        data: {
            traits: {
                body: { configuration: { schema: { '!amount': 'number' } } },
                validation: { configuration: { onValidation: [{ key: 'state', operation: 'transition', input: {} }, { key: 'body', operation: 'close', input: {} }, { key: 'body', operation: 'update', input: {} }] } }
            }
        }
    },
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

    it('reports a delegate that asks for a trait or an operation the entity type lacks', () => {
        const messages = validate().flatMap(({ data }) => data.messages ?? []);
        expect(messages.filter(message => message.includes(STRAY))).to.have.length(2);
        expect(messages.filter(message => !message.includes(STRAY))).to.deep.equal([]);
    });

    it('only stores the errors without a delegate', async () => {
        const created = await invoke(PLAIN, 'create', { businessKey: 'p-1', traits: { body: { amount: 0 } } });
        expect(created.data.validation).to.deep.equal({ amount: 'must be positive' });
        expect(created.data.state).to.equal(undefined);
    });

    it('records the errors and the delegate marks the entity invalid in the same revision', async () => {
        const created = await invoke(INVOICE, 'create', { businessKey: 'i-1', traits: { body: { amount: 0 } } });
        expect(created.revision).to.equal(1);
        expect(created.data.validation).to.deep.equal({ amount: 'must be positive', customer: 'is required' });
        expect(created.data.state).to.deep.equal({ status: 'draft', validity: 'invalid' });
    });

    it('blocks a transition that needs a valid entity until the errors are fixed', async () => {
        await invoke(INVOICE, 'create', { businessKey: 'i-2', traits: { body: { amount: 5 } } });
        const blocked = await errorOf(invoke(INVOICE, 'run', { businessKey: 'i-2', revision: 1, trait: 'state', operation: 'transition', input: { transition: 'issue' } }));
        expect(blocked.code).to.equal('conflict');
        const fixed = await invoke(INVOICE, 'run', { businessKey: 'i-2', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 5, customer: 'acme' } } });
        expect([fixed.revision, fixed.data.validation, fixed.data.state.validity]).to.deep.equal([2, {}, 'valid']);
        const issued = await invoke(INVOICE, 'run', { businessKey: 'i-2', revision: fixed.revision, trait: 'state', operation: 'transition', input: { transition: 'issue' } });
        expect(issued.data.state).to.deep.equal({ status: 'issued', validity: 'valid' });
    });

    it('leaves the delegate alone while the errors stay the same', async () => {
        const created = await invoke(INVOICE, 'create', { businessKey: 'i-4', traits: { body: { amount: 5, customer: 'acme' } } });
        const updated = await invoke(INVOICE, 'run', { businessKey: 'i-4', revision: created.revision, trait: 'body', operation: 'update', input: { value: { amount: 6, customer: 'acme' } } });
        expect([updated.revision, updated.data.state.validity]).to.deep.equal([2, 'valid']);
    });

    it('takes no validation as input', async () => {
        const given = await errorOf(invoke(INVOICE, 'create', { businessKey: 'i-3', traits: { body: { amount: 1, customer: 'acme' }, validation: {} } }));
        expect(given.code).to.equal('invalid');
    });
});
