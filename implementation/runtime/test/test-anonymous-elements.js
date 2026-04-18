import { expect } from 'chai';
import { getElementsOfKind, registerElement } from '@business-framework/core/elements-registry';

describe('anonymous elements (no id)', () => {

    before(() => {
        registerElement({ kind: 'anon-kind', data: { v: 1 } });
        registerElement({ kind: 'anon-kind', data: { v: 2 } });
        registerElement({ kind: 'anon-kind/sub', data: { v: 3 } });
        registerElement({ data: { v: 4 } }); // no kind either
    });

    describe('getElementsOfKind', () => {

        it('should include anonymous elements in kind results', () => {
            const { items } = getElementsOfKind('anon-kind');
            const values = items.map(e => e.data.v);
            expect(values).to.include(1);
            expect(values).to.include(2);
        });

        it('should include anonymous elements from sub-kinds when querying the parent kind', () => {
            const { items } = getElementsOfKind('anon-kind');
            const values = items.map(e => e.data.v);
            expect(values).to.include(3);
        });

        it('should include anonymous elements in exact sub-kind results', () => {
            const { items } = getElementsOfKind('anon-kind/sub');
            const values = items.map(e => e.data.v);
            expect(values).to.include(3);
            expect(values).to.not.include(1);
        });

        it('should not expose anonymous elements under the wrong kind', () => {
            const { items } = getElementsOfKind('other-kind');
            const values = items.map(e => e.data.v);
            expect(values).to.not.include(1);
            expect(values).to.not.include(2);
        });

    });

});
