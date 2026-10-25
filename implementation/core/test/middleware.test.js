import { expect } from 'chai';
import { invoke } from '../src/index.js';
import { bootWith, element, kind, operation } from './helpers.js';

const fill = (id, value, order = {}) => ({ id, kind: 'slot-fill', data: { target: 'service', slot: 'around', value, ...order } });

const service = [
    kind('service-kind', {
        slots: { around: { cardinality: 'many', value: '@method' } },
        operations: {
            run: operation({
                middleware: { '$func/slot-values': { element: '#.self.id', slot: 'around' } },
                action: { set: { $concat: ['#.input', ['action']] } }
            })
        }
    }),
    element('service', 'service-kind')
];

describe('middleware', () => {
    it('runs methods outside to inside around the action, before and after next', async () => {
        await bootWith(service,
            fill('outer', [{ outputKey: 'result', inputMap: { $concat: ['#.input', ['outer']] }, next: true }, { set: { $concat: ['#.result', ['outer-after']] } }], { position: 'first' }),
            fill('inner', { inputMap: { $concat: ['#.input', ['inner']] }, next: true }));
        expect(await invoke('service', 'run', [])).to.deep.equal(['outer', 'inner', 'action', 'outer-after']);
    });

    it('lets a method short-circuit', async () => {
        await bootWith(service, fill('guard', { set: 'stopped' }));
        expect(await invoke('service', 'run', [])).to.equal('stopped');
    });

    it('fails on next outside a middleware', async () => {
        await bootWith(service, kind('lost', { operations: { go: operation({ next: true }) } }), element('the-lost', 'lost'));
        expect((await invoke('the-lost', 'go', null).catch(e => e)).code).to.equal('next-outside-middleware');
    });
});
