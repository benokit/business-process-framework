import { expect } from 'chai';
import { getData, evaluateData } from 'core/data';
import { registerElement } from 'core/elements-registry';

describe('data tests', () => {

    describe('getData', () => {

        it('should get simple data', () => {
            const element = {
                type: 'data',
                id: 'getData-simple',
                data: { name: 'foo' }
            };
            registerElement(element);
            expect(getData(element.id)).to.deep.equal(element);
        });

        it('should return undefined for non-existent id', () => {
            expect(getData('getData-no-such-id')).to.be.undefined;
        });

        it('should evaluate data on retrieval', () => {
            registerElement({
                type: 'data',
                id: 'getData-eval',
                data: { value: { '/literal': { '/ref': 'ignored' } } }
            });
            expect(getData('getData-eval').data).to.deep.equal({ value: { '/ref': 'ignored' } });
        });

        it('should cache and return the same reference on repeated calls', () => {
            registerElement({
                type: 'data',
                id: 'getData-cache',
                data: { x: 1 }
            });
            expect(getData('getData-cache')).to.equal(getData('getData-cache'));
        });
    });

    describe('evaluateData', () => {

        describe('primitives', () => {
            it('should return string as-is', () => {
                expect(evaluateData('hello')).to.equal('hello');
            });

            it('should return number as-is', () => {
                expect(evaluateData(42)).to.equal(42);
            });

            it('should return boolean as-is', () => {
                expect(evaluateData(false)).to.equal(false);
            });

            it('should return null as-is', () => {
                expect(evaluateData(null)).to.equal(null);
            });
        });

        describe('arrays', () => {
            it('should return array of primitives unchanged', () => {
                expect(evaluateData([1, 'two', true])).to.deep.equal([1, 'two', true]);
            });

            it('should recursively evaluate array items', () => {
                expect(evaluateData([{ '/literal': 'raw' }, 2])).to.deep.equal(['raw', 2]);
            });
        });

        describe('plain objects', () => {
            it('should map object values through evaluateData', () => {
                expect(evaluateData({ a: 1, b: 'two' })).to.deep.equal({ a: 1, b: 'two' });
            });

            it('should recursively evaluate nested object values', () => {
                expect(evaluateData({ outer: { inner: 'val' } })).to.deep.equal({ outer: { inner: 'val' } });
            });
        });

        describe('/literal keyword', () => {
            it('should return the literal value as-is', () => {
                expect(evaluateData({ '/literal': 'stop here' })).to.equal('stop here');
            });

            it('should prevent evaluation of nested keywords inside the literal', () => {
                const nested = { '/ref': 'something' };
                expect(evaluateData({ '/literal': nested })).to.deep.equal(nested);
            });

            it('should return a literal array without evaluating its items', () => {
                expect(evaluateData({ '/literal': [{ '/ref': 'x' }] })).to.deep.equal([{ '/ref': 'x' }]);
            });
        });

        describe('/ref keyword', () => {
            it('should resolve /ref to the data of the referenced element', () => {
                registerElement({
                    type: 'data',
                    id: 'ref-target',
                    data: { color: 'blue' }
                });
                expect(evaluateData({ '/ref': 'ref-target' })).to.deep.equal({ color: 'blue' });
            });

            it('should evaluate the referenced element data', () => {
                registerElement({
                    type: 'data',
                    id: 'ref-target-with-literal',
                    data: { value: { '/literal': 42 } }
                });
                expect(evaluateData({ '/ref': 'ref-target-with-literal' })).to.deep.equal({ value: 42 });
            });
        });

        describe('/merge keyword', () => {
            it('should merge an array of objects', () => {
                expect(evaluateData({ '/merge': [{ a: 1 }, { b: 2 }] })).to.deep.equal({ a: 1, b: 2 });
            });

            it('should deep merge nested objects', () => {
                expect(evaluateData({ '/merge': [{ a: { x: 1 } }, { a: { y: 2 } }] }))
                    .to.deep.equal({ a: { x: 1, y: 2 } });
            });

            it('should let later entries overwrite earlier ones for scalar values', () => {
                expect(evaluateData({ '/merge': [{ a: 1 }, { a: 2 }] })).to.deep.equal({ a: 2 });
            });

            it('should evaluate each item in the merge array', () => {
                expect(evaluateData({ '/merge': [{ '/literal': { a: 1 } }, { b: 2 }] }))
                    .to.deep.equal({ a: 1, b: 2 });
            });
        });

        describe('nested keywords', () => {
            it('should evaluate /literal nested inside a plain object', () => {
                expect(evaluateData({ key: { '/literal': [1, 2, 3] } }))
                    .to.deep.equal({ key: [1, 2, 3] });
            });

            it('should evaluate /ref nested inside a plain object', () => {
                registerElement({
                    type: 'data',
                    id: 'nested-ref-target',
                    data: { n: 99 }
                });
                expect(evaluateData({ wrapper: { '/ref': 'nested-ref-target' } }))
                    .to.deep.equal({ wrapper: { n: 99 } });
            });
        });
    });
});
