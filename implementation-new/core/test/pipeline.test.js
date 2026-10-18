import { expect } from 'chai';
import { invoke } from '../src/index.js';
import { bootWith, runner } from './helpers.js';

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

    it('rebinds #.input for a node with inputMap', async () => {
        expect(await run({ inputMap: { $sum: '#.input' }, set: '#.input' }, [1, 2, 3])).to.equal(6);
    });

    it('keeps outputs of a branch inside the branch', async () => {
        expect(await run([
            { outputKey: 'x', set: 1 },
            { if: true, then: [{ outputKey: 'x', set: 2 }] },
            { set: '#.x' }
        ])).to.equal(1);
    });

    it('runs if, switch and forEach', async () => {
        expect(await run([
            { outputKey: 'kind', if: { $gt: ['#.input', 0] }, then: { set: '\\positive' }, else: { set: '\\other' } },
            { outputKey: 'label', switch: { value: '#.kind', cases: { positive: { set: '\\+' }, default: { set: '\\?' } } } },
            { inputMap: ['#.label', '#.label'], forEach: { set: { $join: { _strings: ['#.input', '#.input'] } } } }
        ], 5)).to.deep.equal(['++', '++']);
    });

    it('ends the method with return', async () => {
        expect(await run([
            { if: true, then: [{ return: '\\early' }] },
            { set: '\\late' }
        ])).to.equal('early');
    });

    it('catches thrown values and always runs finally', async () => {
        expect(await run([
            {
                try: { throw: '\\boom' },
                catch: { set: { $join: { _strings: ['\\caught ', '#.error'] } } },
                finally: { set: 1 }
            }
        ])).to.equal('caught boom');
    });

    it('fails on an unknown node keyword', async () => {
        const error = await run({ nonsense: true }).catch(e => e);
        expect(error.code).to.equal('unknown-keyword');
    });

    it("forbids outputKey '_ctx'", async () => {
        const error = await run([{ outputKey: '_ctx', set: {} }]).catch(e => e);
        expect(error.code).to.equal('context-write');
    });
});
