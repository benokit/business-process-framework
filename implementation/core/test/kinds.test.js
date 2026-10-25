import { expect } from 'chai';
import { invoke, validate } from '../src/index.js';
import { bootWith, element, kind, operation } from './helpers.js';

describe('kinds', () => {
    it('invokes an operation inherited along extends, with #.self bound', async () => {
        await bootWith(
            kind('greeter', { shape: { '!greeting': 'string' }, operations: { greet: operation({ set: { $str: ['#.self.data.greeting', ' ', '#.input'] } }) } }),
            kind('polite-greeter', { extends: 'greeter' }),
            element('hello', 'polite-greeter', { greeting: 'Hello' }));
        expect(await invoke('hello', 'greet', 'Ada')).to.equal('Hello Ada');
    });

    it('merges defaults along the chain into the instance data', async () => {
        await bootWith(
            kind('base', { defaults: { a: 1, b: 1 }, operations: { read: operation({ set: '#.self.data' }) } }),
            kind('derived', { extends: 'base', defaults: { b: 2 } }),
            element('one', 'derived', { c: 3 }));
        expect(await invoke('one', 'read', null)).to.deep.equal({ a: 1, b: 2, c: 3 });
    });

    it('rejects input that violates the operation contract', async () => {
        await bootWith(
            kind('counter', { operations: { add: operation({ set: '#.input' }, { '!amount': 'number' }) } }),
            element('c', 'counter'));
        const error = await invoke('c', 'add', { amount: 'x' }).catch(e => e);
        expect(error.code).to.equal('invalid');
    });

    it('rejects output that violates the operation contract', async () => {
        await bootWith(
            kind('liar', { operations: { answer: operation({ set: 'text' }, '@any', 'number') } }),
            element('l', 'liar'));
        const error = await invoke('l', 'answer', null).catch(e => e);
        expect(error.code).to.equal('invalid');
    });

    it('fails on an unknown operation', async () => {
        await bootWith(kind('empty', {}), element('e', 'empty'));
        const error = await invoke('e', 'missing', null).catch(e => e);
        expect(error.code).to.equal('unknown-operation');
    });

    it('fails to boot with an undefined kind', async () => {
        const error = await bootWith(element('x', 'no-such-kind')).catch(e => e);
        expect(error.code).to.equal('unknown-kind');
    });

    it('fails to boot when a subkind redefines an operation', async () => {
        const error = await bootWith(
            kind('a', { operations: { op: operation({ set: 1 }) } }),
            kind('b', { extends: 'a', operations: { op: operation({ set: 2 }) } })).catch(e => e);
        expect(error).to.match(/may not redefine operation 'op'/);
    });

    it('validates instances against the shapes of their kind chain', async () => {
        await bootWith(
            kind('named', { shape: { '!name': 'string' } }),
            element('nameless', 'named', {}));
        expect(validate().map(p => p.code)).to.deep.equal(['invalid-element']);
    });

    it('takes a pure function as either a JS export or a mapping', async () => {
        const signature = { input: 'number', output: 'number' };
        await bootWith(
            element('double', 'pure-function', { signature, mapping: { $multiply: ['#', 2] } }),
            element('both', 'pure-function', { signature, mapping: '#', module: 'lodash-es', export: 'identity' }),
            kind('calculator', { operations: { double: operation({ set: { '$func/double': '#.input' } }) } }),
            element('calculator-1', 'calculator', {}));
        expect(await invoke('calculator-1', 'double', 4)).to.equal(8);
        expect(validate().map(p => [p.code, p.data.element])).to.deep.equal([['invalid-element', 'both']]);
    });
});
