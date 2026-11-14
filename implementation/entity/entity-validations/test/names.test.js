import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';

const packages = ['security', 'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-validations'];

const rule = (name, message) => ({ $if: [{ $gt: ['#.data.body.amount', 0] }, {}, { [name]: message }] });

const fill = (target, id, value) => ({ id, kind: 'slot-fill', data: { target, slot: 'validations', value } });

const entityType = id => ({ id, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!amount': 'number' } } }, validation: { configuration: {} } } } });

describe('names of validation errors', () => {
    before(() => boot({
        paths: packages.map(name => packageElements(`@business-framework/${name}`)),
        elements: [
            entityType('distinct-names'),
            fill('distinct-names', 'distinct-names-amount', rule('amount', 'must be positive')),
            fill('distinct-names', 'distinct-names-limit', rule('limit', 'is too high')),
            entityType('same-name'),
            fill('same-name', 'same-name-first', rule('amount', 'must be positive')),
            fill('same-name', 'same-name-second', rule('amount', 'is too high'))
        ]
    }));

    it('reports an error name that two validations of an entity type can give', () => {
        const messages = validate().flatMap(({ data }) => data.messages ?? []);
        expect(messages).to.deep.equal(["same-name: the validations same-name-first and same-name-second can all give the error 'amount', and the later one overwrites the others"]);
    });
});
