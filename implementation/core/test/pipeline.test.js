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
                catch: { set: { $join: { _strings: ['\\caught ', '#.error.code', '\\ ', '#.error.message'] } } },
                finally: { set: 1 }
            }
        ])).to.equal('caught error boom');
    });

    it('throws typed errors from objects', async () => {
        const error = await run({ throw: { code: '\\conflict', message: '\\taken', data: { key: 1 } } }).catch(e => e);
        expect([error.code, error.message, error.data]).to.deep.equal(['conflict', 'taken', { key: 1 }]);
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
