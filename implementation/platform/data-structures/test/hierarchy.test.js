import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';
import { hierarchyProblems, hierarchySubtree } from '../src/hierarchy.js';

const tree = { sales: { emea: { de: {}, fr: {} }, apac: {} }, finance: {} };

describe('hierarchy', () => {
    before(() => boot({
        paths: [packageElements('@business-framework/data-structures')],
        elements: [
            { id: 'departments', kind: 'hierarchy', data: { tree } },
            { id: 'duplicated', kind: 'hierarchy', data: { tree: { a: { b: {} }, c: { b: {}, D: {} } } } },
            { id: 'shapeless', kind: 'hierarchy', data: { tree: { a: 'b' } } }
        ]
    }));

    it('lists a node and every node below it, and nothing for one it does not know', () => {
        const subtree = node => hierarchySubtree({ hierarchy: 'departments', node });
        expect([subtree('sales'), subtree('emea'), subtree('de'), subtree('nowhere'), subtree(undefined)]).to.deep.equal([
            ['sales', 'emea', 'de', 'fr', 'apac'], ['emea', 'de', 'fr'], ['de'], [], []
        ]);
    });

    it('reports a name twice, one with uppercase letters and a tree of another shape', () => {
        expect(validate().flatMap(({ data }) => data.messages ?? [])).to.include.members([
            "duplicated: 'b' is in the hierarchy twice",
            "duplicated: 'D' has uppercase letters",
            'shapeless: the tree maps each node to an object of its children'
        ]);
        expect(hierarchyProblems('departments')).to.deep.equal([]);
    });
});
