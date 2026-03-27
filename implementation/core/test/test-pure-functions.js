import { expect } from 'chai';
import { compile } from 'lambdajson-js';
import { registerPureFunction, getPureFunctionPrimitives } from '../src/pure-functions.js';

describe('pure function primitives', () => {

    describe('recursive calls', () => {

        before(() => {
            registerPureFunction({
                id: 'test/factorial',
                data: {
                    $conditional: {
                        _if: { $lte: ['#', 1] },
                        _then: 1,
                        _else: { $multiply: ['#', { '$func/test/factorial': { $subtract: ['#', 1] } }] }
                    }
                }
            });
        });

        function callFactorial(n) {
            return compile({ '$func/test/factorial': '#' }, getPureFunctionPrimitives())(n);
        }

        it('factorial(1) = 1', () => {
            expect(callFactorial(1)).to.equal(1);
        });

        it('factorial(5) = 120', () => {
            expect(callFactorial(5)).to.equal(120);
        });

        it('factorial(10) = 3628800', () => {
            expect(callFactorial(10)).to.equal(3628800);
        });
    });
});
