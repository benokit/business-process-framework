import { expect } from 'chai';
import { interpret, invoke } from '../src/index.js';
import { calls } from './fixtures/effects.js';
import { bootWith, element, kind, low, operation } from './helpers.js';

const errorOf = promise => promise.then(() => null, error => error);

const bootStore = () => bootWith(
    kind('store', {
        operations: {
            get: operation(low('record', ['read']), '@any', 'number'),
            put: operation(low('record', ['write'])),
            note: operation(low('record', ['trace']))
        }
    }),
    kind('local-store', { extends: 'store' }),
    element('the-store', 'local-store'),
    element('other-store', 'store'),
    kind('runner', { operations: { run: operation([{ invoke: 'the-store', operation: 'note' }, { invoke: 'the-store', operation: 'put' }, { invoke: 'other-store', operation: 'get' }]) } }),
    element('the-runner', 'runner'));

describe('interpreter', () => {
    afterEach(() => interpret());

    it('runs every effect in production', async () => {
        await bootStore();
        await invoke('the-runner', 'run', 1);
        expect(calls.map(({ input }) => input)).to.deep.equal([1, 1, 1]);
    });

    it('replaces operations by stubs, named by element or by kind, and refuses a stubbed effect without one', async () => {
        await bootStore();
        const stubbed = [];
        interpret({ effects: ['trace'], stubs: { store: { get: ({ input }) => input + 1 }, 'the-store': { put: ({ input }) => stubbed.push(input) } } });
        expect(await invoke('the-runner', 'run', 1)).to.equal(2);
        expect([calls.length, stubbed]).to.deep.equal([1, [1]]);

        interpret({ effects: ['trace'], stubs: { store: { get: () => 0 } } });
        const error = await errorOf(invoke('the-runner', 'run', 1));
        expect([error.code, error.data.element, error.data.effects]).to.deep.equal(['stubbed-effect', 'the-store', ['write']]);
    });

    it('checks a stub against the operation contract', async () => {
        await bootStore();
        interpret({ stubs: { store: { get: () => 'not a number' } } });
        expect((await errorOf(invoke('other-store', 'get', 1))).code).to.equal('invalid');
    });

    it('is reset to production by boot', async () => {
        await bootStore();
        interpret({ effects: [] });
        await bootStore();
        await invoke('the-runner', 'run', 1);
        expect(calls.length).to.equal(3);
    });
});
