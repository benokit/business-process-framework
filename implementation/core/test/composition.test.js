import { expect } from 'chai';
import { combine, compose, resolve } from '../src/composition.js';

const R = v => ({ '/replace': v });
const U = { '/unset': true };
const A = xs => ({ '/append': xs });

describe('composition algebra', () => {
    it('merges objects by key and replaces everything else, arrays included', () => {
        expect(compose([{ a: 1, b: { c: 1 }, l: [1, 2] }, { b: { d: 2 }, l: [3] }])).to.deep.equal({ a: 1, b: { c: 1, d: 2 }, l: [3] });
    });

    it('replaces an object as a whole', () => {
        expect(compose([{ r: { max: 3, delay: 5 } }, { r: R({ max: 1 }) }])).to.deep.equal({ r: { max: 1 } });
    });

    it('unsets a key and lets a later item set it again', () => {
        expect(compose([{ a: 1, b: 2 }, { a: U }])).to.deep.equal({ b: 2 });
        expect(compose([{ r: { max: 3, delay: 5 } }, { r: U }, { r: { max: 1 } }])).to.deep.equal({ r: { max: 1 } });
    });

    it('appends to an array, also after a replace or an unset', () => {
        expect(compose([{ l: [1] }, { l: A([2]) }, { l: A([3]) }])).to.deep.equal({ l: [1, 2, 3] });
        expect(compose([{ l: [1] }, { l: R([2]) }, { l: A([3]) }])).to.deep.equal({ l: [2, 3] });
        expect(compose([{ l: [1] }, { l: U }, { l: A([3]) }])).to.deep.equal({ l: [3] });
    });

    it('fails on values it can\'t combine, naming the path', () => {
        const error = (() => { try { compose([{ a: { b: 1 } }, { a: { b: A([1]) } }]); } catch (e) { return e; } })();
        expect(error.code).to.equal('composition-type');
        expect(error.data.path).to.deep.equal(['a', 'b']);
        expect(() => compose([{ a: [1] }, { a: { b: 1 } }])).to.throw();
        expect(() => compose([{ a: A(1) }])).to.throw();
    });

    it('is associative', () => {
        const values = [undefined, 1, [1], { a: 1 }, { b: 2 }, { a: { c: 1 } }, R({ c: 1 }), R([3]), R(5), U, A([2]), A([4])];
        const attempt = f => { try { return { value: resolve(f()) }; } catch { return undefined; } };
        const cases = values.flatMap(a => values.flatMap(b => values.map(c => [a, b, c])));
        const failures = cases.filter(([a, b, c]) => {
            const left = attempt(() => combine(combine({ k: a }, { k: b }), { k: c }));
            const right = attempt(() => combine({ k: a }, combine({ k: b }, { k: c })));
            return left !== undefined && right !== undefined && JSON.stringify(left) !== JSON.stringify(right);
        });
        expect(failures).to.deep.equal([]);
    });
});
