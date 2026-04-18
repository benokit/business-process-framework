import { expect } from 'chai';
import { getElement, getElementsOfKind, registerElement } from '@business-framework/runtime/elements-registry';

describe('injection tests', () => {

    before(() => {
        registerElement({ id: 'inj-abstract', kind: 'service', data: { name: 'abstract' } });
        registerElement({ id: 'inj-concrete', kind: 'service', data: { name: 'concrete' } });
        registerElement({ id: 'inj-unrelated', kind: 'service', data: { name: 'unrelated' } });

        registerElement({
            id: 'inj-setup',
            kind: 'injection',
            data: [
                { into: 'inj-abstract', inject: 'inj-concrete' }
            ]
        });
    });

    describe('getElement', () => {

        it('should return the injected element when looking up the target id', () => {
            const result = getElement('inj-abstract');
            expect(result.id).to.equal('inj-concrete');
        });

        it('should return the concrete element directly when looking up its own id', () => {
            const result = getElement('inj-concrete');
            expect(result.id).to.equal('inj-concrete');
        });

        it('should bypass injection with a leading / and return the original element', () => {
            const result = getElement('/inj-abstract');
            expect(result.id).to.equal('inj-abstract');
        });

        it('should not affect unrelated elements', () => {
            const result = getElement('inj-unrelated');
            expect(result.id).to.equal('inj-unrelated');
        });

    });

    describe('getElementsOfKind', () => {

        it('should exclude injection targets from results', () => {
            const { items } = getElementsOfKind('service');
            const ids = items.map(e => e.id);
            expect(ids).to.not.include('inj-abstract');
        });

        it('should include the injected element in results', () => {
            const { items } = getElementsOfKind('service');
            const ids = items.map(e => e.id);
            expect(ids).to.include('inj-concrete');
        });

        it('should include unrelated elements in results', () => {
            const { items } = getElementsOfKind('service');
            const ids = items.map(e => e.id);
            expect(ids).to.include('inj-unrelated');
        });

    });

    describe('multiple injections in one element', () => {

        before(() => {
            registerElement({ id: 'inj-a1', data: { v: 1 } });
            registerElement({ id: 'inj-a2', data: { v: 2 } });
            registerElement({ id: 'inj-b1', data: { v: 3 } });
            registerElement({ id: 'inj-b2', data: { v: 4 } });

            registerElement({
                id: 'inj-multi',
                kind: 'injection',
                data: [
                    { into: 'inj-a1', inject: 'inj-a2' },
                    { into: 'inj-b1', inject: 'inj-b2' }
                ]
            });
        });

        it('should apply all injections in the element', () => {
            expect(getElement('inj-a1').id).to.equal('inj-a2');
            expect(getElement('inj-b1').id).to.equal('inj-b2');
        });

    });

});
