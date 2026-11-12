import { expect } from 'chai';
import { invoke, validate } from '../src/index.js';
import { instanceMethods, selvesOf } from '../src/kinds.js';
import { bootWith, element, kind, operation } from './helpers.js';

describe('kinds', () => {
    it('invokes an operation inherited along extends, with #.self bound', async () => {
        await bootWith(
            kind('greeter', { shape: { '!greeting': 'string' }, operations: { greet: operation({ set: { $str: ['#.self.data.greeting', ' ', '#.input'] } }) } }),
            kind('polite-greeter', { extends: 'greeter' }),
            element('hello', 'polite-greeter', { greeting: 'Hello' }));
        expect(await invoke('hello', 'greet', 'Ada')).to.equal('Hello Ada');
    });

    it('unites the fixed values along the chain into the instance data', async () => {
        await bootWith(
            kind('base', { fixed: { a: 1, nested: { x: 1 } }, operations: { read: operation({ set: '#.self.data' }) } }),
            kind('derived', { extends: 'base', fixed: { b: 2, nested: { y: 2 } } }),
            element('one', 'derived', { c: 3, a: 1 }));
        expect(await invoke('one', 'read', null)).to.deep.equal({ a: 1, b: 2, c: 3, nested: { x: 1, y: 2 } });
    });

    describe('mapping', () => {
        const kinds = [
            kind('base', {
                shape: { '!name': 'string' },
                fixed: { type: 'base' },
                operations: { read: operation({ set: '#.self.data' }), describe: { input: '@any' } }
            }),
            kind('derived', {
                extends: 'base',
                shape: { '!label': 'string' },
                fixed: { origin: 'derived' },
                mapping: { name: '#.data.label', id: '#.id' },
                operations: { own: operation({ set: '#.self.data' }), describe: { implementation: { set: '#.self.data' } } }
            }),
            element('one', 'derived', { label: 'Ada' })
        ];

        it('gives the code of each kind the data in the shape of that kind', async () => {
            await bootWith(...kinds);
            expect(await invoke('one', 'own', null)).to.deep.equal({ label: 'Ada', origin: 'derived' });
            expect(await invoke('one', 'read', null)).to.deep.equal({ name: 'Ada', id: 'one', type: 'base' });
        });

        it('runs an implementation at the level of the kind that writes it', async () => {
            await bootWith(...kinds);
            expect(await invoke('one', 'describe', null)).to.deep.equal({ label: 'Ada', origin: 'derived' });
        });

        it('checks the data of every level against the shape of its kind', async () => {
            await bootWith(...kinds.slice(0, 2), element('one', 'derived', { label: 'Ada' }), element('two', 'derived', { label: 1 }));
            expect(validate().map(problem => problem.data.element ?? problem.data.id)).to.include('two');
        });

        it('rejects a shape without a mapping where the parent has a shape', async () => {
            const error = await bootWith(kind('base', { shape: { a: 'string' } }), kind('derived', { extends: 'base', shape: { b: 'string' } })).catch(e => e);
            expect(error.message).to.include('derived declares a shape without a mapping');
        });

        it('accepts a shape without a mapping where no parent has one', async () => {
            await bootWith(kind('base', {}), kind('derived', { extends: 'base', shape: { '!b': 'string' } }), element('one', 'derived', { b: 'x' }));
            expect(validate()).to.deep.equal([]);
        });

        it('gives the instances of a kind, and their methods, as that kind sees them', async () => {
            await bootWith(
                kind('base', { shape: { '!run': '@method' } }),
                kind('derived', { extends: 'base', shape: { '!label': 'string' }, mapping: { run: { set: '#.data.label' } } }),
                element('one', 'derived', { label: 'Ada' }));
            expect(selvesOf('base').map(({ id, data }) => [id, Object.keys(data)])).to.deep.equal([['one', ['run']]]);
            expect(selvesOf('derived').map(({ data }) => Object.keys(data))).to.deep.equal([['label']]);
            expect(instanceMethods({ kind: 'base', property: 'run' }).map(({ id }) => id)).to.deep.equal(['one']);
        });

        const mapping = (code, ...elements) => [
            kind('base', { shape: { '!name': 'string' } }),
            kind('derived', { extends: 'base', shape: { label: 'string' }, mapping: code }),
            ...elements
        ];

        it('names the kind and the instance of a mapping that fails', async () => {
            const error = await bootWith(...mapping({ name: { $add: ['#.data.label', 1] } }, element('one', 'derived', {}))).catch(e => e);
            expect(error.code).to.equal('mapping-failed');
            expect(error.message).to.include('one: the mapping of derived failed');
        });

        it('names the level whose shape the mapped data break', async () => {
            await bootWith(...mapping({ name: 1 }, element('one', 'derived', { label: 'Ada' })));
            expect(validate().map(problem => problem.message)).to.include("one doesn't match the shape of base (its data as mapped for base)");
        });

        const fixing = (mapping, ...elements) => [
            kind('base', { fixed: { a: 1 }, operations: { read: operation({ set: '#.self.data' }) } }),
            kind('derived', { extends: 'base', fixed: { a: 2 }, mapping, operations: { own: operation({ set: '#.self.data' }) } }),
            element('one', 'derived'),
            ...elements
        ];

        it('keeps the fixed values of a kind out of the levels above its mapping', async () => {
            await bootWith(...fixing({ b: 3 }));
            expect(await invoke('one', 'own', null)).to.deep.equal({ a: 2 });
            expect(await invoke('one', 'read', null)).to.deep.equal({ a: 1, b: 3 });
        });

        it('rejects a mapping that changes a fixed value of its parent', async () => {
            const error = await bootWith(...fixing({ a: '#.data.a' })).catch(e => e);
            expect(error.code).to.equal('fixed-conflict');
        });
    });

    it('checks the shape after the fixed values are filled in', async () => {
        await bootWith(
            kind('provided', { shape: { '!provider': 'string' }, fixed: { provider: 'database' } }),
            element('one', 'provided'));
        expect(validate()).to.deep.equal([]);
    });

    it('rejects a kind that changes an inherited fixed value', async () => {
        const error = await bootWith(kind('base', { fixed: { a: { b: 1 } } }), kind('derived', { extends: 'base', fixed: { a: { b: 2 } } })).catch(e => e);
        expect(error.message).to.include("derived can't change the fixed value at 'a.b'");
    });

    it('rejects an instance that changes a fixed value, and accepts one that repeats it', async () => {
        const error = await bootWith(kind('base', { fixed: { a: 1 } }), element('one', 'base', { a: 2 })).catch(e => e);
        expect(error.code).to.equal('fixed-conflict');
        expect(error.data).to.deep.equal({ owner: 'one', path: ['a'] });
        await bootWith(kind('base', { fixed: { a: 1 } }), element('one', 'base', { a: 1 }));
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

    it('names the kinds above an element, nearest first', async () => {
        await bootWith(
            kind('chain', { operations: { of: operation({ set: { '$func/kind-chain': '#.input' } }) } }),
            kind('contract', {}),
            kind('liability', { extends: 'contract' }),
            element('general-liability', 'liability'),
            element('chains', 'chain'));
        const chains = await Promise.all(['general-liability', 'liability', 'contract', 'nothing'].map(id => invoke('chains', 'of', id)));
        expect(chains).to.deep.equal([['liability', 'contract'], ['contract'], [], []]);
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
