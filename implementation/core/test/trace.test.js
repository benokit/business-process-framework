import { expect } from 'chai';
import { invoke, traced } from '../src/index.js';
import { bootWith, element, kind, low, operation } from './helpers.js';
import { calls } from './fixtures/effects.js';

const labels = spans => spans.map(({ label, children }) => children.length ? { [label]: labels(children) } : label);

const elements = [
    kind('worker', {
        operations: {
            inner: operation([low('record', ['write'])]),
            outer: operation([
                { outputKey: 'a', inputMap: '#.input', set: '#.input' },
                { if: true, then: { invoke: 'the-worker', operation: 'inner' } },
                { throw: 'boom' }
            ])
        }
    }),
    element('the-worker', 'worker')
];

describe('tracing', () => {
    beforeEach(() => bootWith(elements));

    it('records the spans of a run, with the error that ended it', async () => {
        const { error, spans } = await traced(() => invoke('the-worker', 'outer', 1));
        expect(error).to.deep.include({ code: 'error', message: 'boom' });
        expect(labels(spans)).to.deep.equal([{
            'the-worker.outer': ['step 1 set', { 'step 2 if': [{ 'step 1 invoke': [{ 'the-worker.inner': [{ 'step 1 low': ['low record'] }] }] }] }, 'step 3 throw']
        }]);
        expect(spans[0].children[2].error).to.equal('error');
    });

    it('lists the effects a low node has, and runs it', async () => {
        const { spans } = await traced(() => invoke('the-worker', 'inner', 1));
        expect(spans[0].children[0].children[0]).to.deep.include({ label: 'low record', effects: ['write'] });
        expect(calls).to.have.length(1);
    });

    it('skips low nodes with the effects it is told to, answering null', async () => {
        const { result, spans } = await traced(() => invoke('the-worker', 'inner', 1), { skip: ['write'] });
        expect([result, calls.length, spans[0].children[0].children[0].skipped]).to.deep.equal([null, 0, true]);
    });

    it('leaves nothing behind: the next run is untraced and runs low nodes', async () => {
        await traced(() => invoke('the-worker', 'inner', 1), { skip: ['write'] });
        await invoke('the-worker', 'inner', 1);
        expect(calls).to.have.length(1);
    });
});
