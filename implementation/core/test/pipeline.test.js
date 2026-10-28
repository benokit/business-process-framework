import { expect } from 'chai';
import { invoke } from '../src/index.js';
import { executors } from '../src/execution/nodes/index.js';
import { nodeForms } from '../src/execution/nodes/forms.js';
import { bootWith, EFFECTS, runner } from './helpers.js';

const run = async (implementation, input = null) => {
    await bootWith(runner(implementation));
    return invoke('the-runner', 'run', input);
};

describe('pipelines', () => {
    it('passes outputs to later nodes through outputKey', async () => {
        expect(await run([
            { outputKey: 'x', set: 2 },
            { set: { $multiply: ['#.x', '#.input'] } }
        ], 21)).to.equal(42);
    });

    it('passes the inputMap result on, while the node itself sees its own scope', async () => {
        expect(await run([
            { outputKey: 'method', set: { $literal: { set: { $sum: '#.input' } } } },
            { inputMap: [1, 2, 3], execute: '#.method' }
        ])).to.equal(6);
        expect(await run({ inputMap: { $sum: '#.input' }, if: { $eq: ['#.input', 'raw'] }, then: { set: '#.input' } }, 'raw')).to.equal('raw');
    });

    it('keeps outputs of a branch inside the branch', async () => {
        expect(await run([
            { outputKey: 'x', set: 1 },
            { if: true, then: [{ outputKey: 'x', set: 2 }] },
            { set: '#.x' }
        ])).to.equal(1);
    });

    it('runs if, switch and forEach, whose body sees the item and the outer input', async () => {
        expect(await run([
            { outputKey: 'kind', if: { $gt: ['#.input', 0] }, then: { set: 'positive' }, else: { set: 'other' } },
            { outputKey: 'label', switch: { value: '#.kind', cases: { positive: { set: '+' }, default: { set: '?' } } } },
            { inputMap: ['#.label', '#.label'], forEach: { set: { $str: ['#.item', '#.input'] } } }
        ], 5)).to.deep.equal(['+5', '+5']);
    });

    it('ends the method with return', async () => {
        expect(await run([
            { if: true, then: [{ return: 'early' }] },
            { set: 'late' }
        ])).to.equal('early');
    });

    it('catches thrown values and always runs finally', async () => {
        expect(await run([
            {
                try: { throw: 'boom' },
                catch: { set: { $str: ['caught ', '#.error.code', ' ', '#.error.message'] } },
                finally: { set: 1 }
            }
        ])).to.equal('caught error boom');
    });

    it('throws typed errors from objects', async () => {
        const error = await run({ throw: { code: 'conflict', message: 'taken', data: { key: 1 } } }).catch(e => e);
        expect([error.code, error.message, error.data.key]).to.deep.equal(['conflict', 'taken', 1]);
    });

    it('fails with a CoreError naming the mapping path when an operand is missing', async () => {
        const error = await run({ set: { $sum: [1, '#.missing'] } }).catch(e => e);
        expect([error.constructor.name, error.code, error.data.path]).to.deep.equal(['CoreError', 'missing-operand', '/$sum']);
    });

    it('fails on an unknown node keyword', async () => {
        const error = await run({ nonsense: true }).catch(e => e);
        expect(error.code).to.equal('unknown-keyword');
    });

    it("forbids outputKey '_ctx'", async () => {
        const error = await run([{ outputKey: '_ctx', set: {} }]).catch(e => e);
        expect(error.code).to.equal('context-write');
    });

    it('adds a frame per level to an escaping error, outermost first', async () => {
        const error = await run([{ set: 1 }, { inputMap: { $sum: [1, '#.missing'] }, set: 2 }]).catch(e => e);
        expect(error.data.frames).to.deep.equal(['the-runner.run', 'step 2 inputMap']);
        const nested = await run([{ if: true, then: [{ set: 1 }, { throw: 'boom' }] }]).catch(e => e);
        expect(nested.data.frames).to.deep.equal(['the-runner.run', 'step 1 if', 'step 2 throw']);
    });

    it('records only the route up to the catch', async () => {
        const output = await run([{ try: { throw: 'boom' }, catch: { set: '#.error.data' } }]);
        expect(output.frames).to.deep.equal(['step 1 throw']);
    });

    it('wraps a foreign error of a low node, keeping the cause', async () => {
        const error = await run({ low: { module: EFFECTS, export: 'tryToMutateContext', effects: ['irreversible'] } }).catch(e => e);
        expect([error.code, error.data.module, error.cause instanceof Error]).to.deep.equal(['low-failed', EFFECTS, true]);
    });

    it('declares the form of every node keyword', () => {
        expect(Object.keys(nodeForms)).to.have.members(Object.keys(executors));
    });
});
