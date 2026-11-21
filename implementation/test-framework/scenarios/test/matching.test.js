import { expect } from 'chai';
import { matches } from '../src/matching.js';

describe('matching', () => {
    it('matches an object by the keys of the expected one, and a list by all its items', () => {
        expect(matches({ actual: { a: 1, b: { c: 2, d: 3 } }, expected: { b: { c: 2 } } })).to.equal(true);
        expect(matches({ actual: [{ a: 1, b: 2 }], expected: [{ a: 1 }] })).to.equal(true);
        expect(matches({ actual: [1, 2], expected: [1] })).to.equal(false);
        expect(matches({ actual: { a: 1 }, expected: { a: 2 } })).to.equal(false);
        expect(matches({ actual: undefined, expected: { a: 1 } })).to.equal(false);
    });
});
