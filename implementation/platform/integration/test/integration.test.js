import { expect } from 'chai';
import { boot, invoke, packageElements, validate } from '@business-framework/core';

const errorOf = promise => promise.then(() => null, error => error);

const implementation = (provider, value) => ({
    kind: 'slot-fill',
    data: { target: 'greeting', slot: 'implementations', value: { provider, implementation: value } }
});

const elements = ({ binding = 'english', fills }) => [
    { id: 'greeter', kind: 'kind', data: { shape: { '!word': 'string' } } },
    { id: 'polite-greeter', kind: 'kind', data: { extends: 'greeter' } },
    { id: 'english', kind: 'polite-greeter', data: { word: 'hello' } },
    { id: 'pirate', kind: 'greeter', data: { word: 'ahoy' } },
    { kind: 'binding', data: { abstraction: 'greeter', instance: binding } },
    { id: 'greeting', kind: 'integration', data: { provider: 'greeter', input: { '!name': 'string' }, output: 'string', errors: ['not-found'] } },
    ...fills
];

const bootWith = options => boot({ paths: [packageElements('@business-framework/integration')], elements: elements(options) });

const greet = { set: { $str: ['#.input.name', '!'] } };

describe('integration', () => {
    it('runs the implementation for the most specific kind of the bound provider', async () => {
        await bootWith({ fills: [implementation('greeter', greet), implementation('polite-greeter', { set: 'polite' })] });
        expect(await invoke('greeting', 'run', { name: 'Ann' })).to.equal('polite');
        expect(validate()).to.deep.equal([]);
    });

    it('falls back to an implementation for a more general kind', async () => {
        await bootWith({ binding: 'pirate', fills: [implementation('greeter', greet), implementation('polite-greeter', { set: 'polite' })] });
        expect(await invoke('greeting', 'run', { name: 'Ann' })).to.equal('Ann!');
    });

    it('checks input and output against the contract', async () => {
        await bootWith({ fills: [implementation('greeter', { set: 1 })] });
        expect((await errorOf(invoke('greeting', 'run', {}))).code).to.equal('invalid');
        expect((await errorOf(invoke('greeting', 'run', { name: 'Ann' }))).code).to.equal('invalid');
    });

    it('passes declared errors and refuses undeclared ones', async () => {
        await bootWith({ fills: [implementation('greeter', { if: { $eq: ['#.input.name', 'nobody'] }, then: { throw: { code: 'not-found', message: 'no one' } }, else: { throw: 'broken' } })] });
        expect((await errorOf(invoke('greeting', 'run', { name: 'nobody' }))).code).to.equal('not-found');
        const error = await errorOf(invoke('greeting', 'run', { name: 'Ann' }));
        expect([error.code, error.data.error.code]).to.deep.equal(['undeclared-error', 'error']);
    });

    it('reports every provider instance without an implementation', async () => {
        await bootWith({ fills: [implementation('polite-greeter', greet)] });
        expect(validate().map(({ message }) => message)).to.deep.equal(['greeting: no implementation for greeter (pirate)']);
        await bootWith({ binding: 'pirate', fills: [implementation('polite-greeter', greet)] });
        expect((await errorOf(invoke('greeting', 'run', { name: 'Ann' }))).code).to.equal('unimplemented-integration');
    });
});
