import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';

const packages = ['security', 'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'data-structures', 'entity-states', 'entity-validations', 'entity-ownership'];

const ownership = (dependsOn, rule) => ({ dependsOn, configuration: { dimensions: { '!department': 'string' }, rule } });

const state = { states: { status: { open: true } }, transitions: { keep: { status: { open: 'open' } } }, initialStates: { default: { status: 'open' } } };

const types = {
    complete: { body: { configuration: { schema: { '!department': 'string' } } }, ownership: ownership(['body'], { department: '#.data.body.department' }) },
    incomplete: { body: { configuration: { schema: { '!department': 'string' } } }, state: { configuration: state }, ownership: ownership(['body'], { department: { $if: [{ $eq: ['#.data.state.status', 'open'] }, '#.data.body.department', 'none'] } }) },
    always: { body: { configuration: { schema: { '!department': 'string' } } }, state: { configuration: state }, ownership: ownership(undefined, { department: { $if: [{ $eq: ['#.data.state.status', 'open'] }, '#.data.body.department', 'none'] } }) },
    validated: { body: { configuration: { schema: { '!amount': 'number' } } }, state: { configuration: state }, validation: { dependsOn: ['body'], configuration: {} } }
};

describe('dependsOn of rules', () => {
    before(() => boot({
        paths: packages.map(name => packageElements(`@business-framework/${name}`)),
        elements: [
            ...Object.entries(types).map(([id, traits]) => ({ id: `${id}-order`, kind: 'entity-type', data: { traits } })),
            { id: 'validated-state-rule', kind: 'slot-fill', data: { target: 'validated-order', slot: 'validations', value: { $if: [{ $eq: ['#.data.state.status', 'open'] }, {}, { status: 'must be open' }] } } },
            { id: 'validated-amount-rule', kind: 'slot-fill', data: { target: 'validated-order', slot: 'validations', value: { $if: [{ $gt: ['#.data.body.amount', 0] }, {}, { amount: 'must be positive' }] } } }
        ]
    }));

    it('reports a key an ownership rule or a validation reads that dependsOn does not list, and nothing else', () => {
        const messages = validate().flatMap(({ data }) => data.messages ?? []);
        expect(messages.filter(message => message.includes('dependsOn')).sort()).to.deep.equal([
            "incomplete-order: the ownership rule of 'ownership' reads 'state', which dependsOn doesn't list",
            "validated-order: the validations of 'validation' reads 'state', which dependsOn doesn't list"
        ]);
    });
});
