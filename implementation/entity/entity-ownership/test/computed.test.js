import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';
import { bindPrincipal } from '../src/ownership.js';

const packages = ['security', 'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'data-structures', 'entity-ownership'];

const tree = { sales: { emea: { de: {}, fr: {} }, apac: {} }, finance: {} };

const subtree = node => ({ '$func/hierarchy-subtree': { hierarchy: 'departments', node } });

const below = { $includes: { collection: subtree('#.principal.department'), value: '#.ownership.department' } };

describe('computed values in scopes', () => {
    before(() => boot({
        paths: packages.map(name => packageElements(`@business-framework/${name}`)),
        elements: [
            { id: 'departments', kind: 'hierarchy', data: { tree } },
            { id: 'regional', kind: 'kind', data: { extends: 'entity-type', fixed: { traits: { ownership: { configuration: { dimensions: { '!department': 'string' } } } } } } },
            { id: 'memo', kind: 'regional', data: { traits: { body: { configuration: { schema: { '!department': 'string' } } }, ownership: { configuration: { rule: { department: '#.data.body.department' } } } } } },
            { id: 'below', kind: 'ownership-scope', data: { filter: below } },
            { id: 'from-ownership', kind: 'ownership-scope', data: { filter: { $includes: { collection: subtree('#.ownership.department'), value: '#.ownership.department' } } } }
        ]
    }));

    it('accepts a value computed from the principal and reports one that uses the ownership', () => {
        const messages = validate().flatMap(({ data }) => data.messages ?? []);
        expect(messages.find(message => message.startsWith('from-ownership'))).to.include('may use only the principal');
        expect(messages.filter(message => message.startsWith('below'))).to.deep.equal([]);
    });

    it('resolves it when the filter is bound, leaving a plain predicate over the dimensions', () => {
        expect(bindPrincipal(below, { department: 'emea' })).to.deep.equal({ $includes: { collection: ['emea', 'de', 'fr'], value: '#.ownership.department' } });
        expect(bindPrincipal(below, { department: 'nowhere' })).to.equal(false);
        expect(bindPrincipal(below, {})).to.equal(false);
    });
});
