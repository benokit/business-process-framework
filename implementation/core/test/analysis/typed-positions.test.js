import { expect } from 'chai';
import { validate } from '../../src/index.js';
import { referencesOf } from '../../src/analysis/introspection.js';
import { findElement } from '../../src/registry.js';
import { bootWith, element, kind } from '../helpers.js';

const OPEN = { type: 'object', properties: { amount: { type: 'number' } }, additionalProperties: false };

const provider = (id, mapping, kindId = 'input-type-pure-function') => element(id, kindId, { mapping });

const fieldsProvider = provider('fields-type', { type: 'object', properties: '#.data.fields', additionalProperties: false });

const form = (id, data) => element(id, 'form', data);

const formKind = (code, extra = {}) => kind('form', {
    shape: { '!fields': 'object', rule: '@mapping/fields-type', check: '@method/fields-type', ...extra }
});

const problemsOf = () => validate().map(({ code, data }) => [code, data.element, data.path]);

describe('typed code positions', () => {
    it('infers a mapping at a position that names a provider against the type the provider gives for the owning element', async () => {
        await bootWith(formKind(), fieldsProvider,
            form('priced', { fields: { amount: { type: 'number' } }, rule: { $sum: ['#.amount', 1] } }),
            form('mistyped', { fields: { amount: { type: 'number' } }, rule: { $sum: ['#.amount', '#.nme'] } }),
            form('other', { fields: { name: { type: 'string' } }, rule: { $sum: ['#.amount', 1] } }));
        expect(problemsOf()).to.deep.equal([['unknown-path', 'mistyped', 'rule.$sum[1]'], ['unknown-path', 'other', 'rule.$sum[0]']]);
    });

    it('gives a method at such a position the type as its input', async () => {
        await bootWith(formKind(), fieldsProvider,
            form('checked', { fields: { amount: { type: 'number' } }, check: { set: '#.input.amount' } }),
            form('misspelled', { fields: { amount: { type: 'number' } }, check: { set: '#.input.amout' } }));
        expect(problemsOf()).to.deep.equal([['unknown-path', 'misspelled', 'check.set']]);
    });

    it('leaves a position that names no provider as it was', async () => {
        await bootWith(kind('plain', { shape: { rule: '@mapping' } }), element('plain-one', 'plain', { rule: { $sum: ['#.nothing', 1] } }));
        expect(problemsOf()).to.deep.equal([]);
    });

    it('fills in the signature of a provider, and refuses at load one that contradicts it', async () => {
        const contradicting = element('contradicting', 'input-type-pure-function', { signature: { input: 'string', output: 'object' }, mapping: { type: 'object' } });
        const error = await bootWith(formKind(), fieldsProvider, contradicting).catch(failure => failure);
        expect(error.message).to.include("contradicting can't change the fixed value at 'signature.input'");
    });

    it('reports a position that names a pure function which does not implement the interface, and names the kind it needs', async () => {
        await bootWith(formKind(),
            element('fields-type', 'pure-function', { signature: { input: '@any', output: 'object' }, mapping: OPEN }),
            form('one', { fields: {}, rule: { $sum: [1, 2] } }));
        const [problem] = validate();
        expect([problem.code, problem.data.element, problem.data.path]).to.deep.equal(['invalid-reference', 'one', 'rule']);
        expect(problem.message).to.include("'fields-type' is not a input-type-pure-function");
    });

    it('lists the provider of a position among the references of the element', async () => {
        await bootWith(formKind(), fieldsProvider, form('priced', { fields: {}, rule: { $sum: [1, 2] } }));
        expect(referencesOf(findElement('priced')).map(({ to, path, via }) => [to, path, via])).to.deep.include(['fields-type', 'rule', 'input type']);
    });
});
