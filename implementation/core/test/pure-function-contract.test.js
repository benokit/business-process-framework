import { expect } from 'chai';
import { applyMapping } from '../src/mappings.js';
import { validate } from '../src/index.js';
import { bootWith, element } from './helpers.js';

const functions = () => [
    element('half', 'pure-function', { signature: { input: 'number', output: 'number' }, mapping: { $divide: ['#', 2] } }),
    element('named', 'pure-function', { signature: { input: { '!first': 'string' }, output: 'number' }, mapping: { $str: ['#.first', '!'] } })
];

const run = tree => {
    try {
        return applyMapping({ mapping: tree, input: null });
    } catch (error) {
        return error;
    }
};

describe('pure function contracts', () => {
    afterEach(() => {
        delete process.env.NODE_ENV;
    });

    it('checks the argument and the result of a call against the signature, outside production', async () => {
        await bootWith(...functions());
        expect(run({ '$func/half': 4 })).to.equal(2);
        const wrongArgument = run({ '$func/half': 'four' });
        expect([wrongArgument.code, wrongArgument.data.side]).to.deep.equal(['function-contract', 'input']);
        const wrongResult = run({ '$func/named': { first: 'a' } });
        expect([wrongResult.code, wrongResult.data.side]).to.deep.equal(['function-contract', 'output']);
    });

    it('does not check in production', async () => {
        process.env.NODE_ENV = 'production';
        await bootWith(...functions());
        expect(run({ '$func/half': 'four' })).to.deep.equal(Number.NaN);
        expect(run({ '$func/named': { first: 'a' } })).to.equal('a!');
    });

    it('reports a mapping whose result is not what the signature declares', async () => {
        await bootWith(...functions());
        expect(validate().map(({ code, data }) => [code, data.element, data.path])).to.deep.equal([['type-mismatch', 'named', 'mapping']]);
    });
});
