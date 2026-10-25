import { expect } from 'chai';
import { validate } from '../src/index.js';
import { effectsOf, effectTracesOf } from '../src/effect-inference.js';
import { bootWith, element, kind, low, operation } from './helpers.js';

const store = [
    kind('store', {
        operations: {
            get: operation(low('record', ['read'])),
            put: operation(low('record', ['write'])),
            send: operation(low('record', ['irreversible'])),
            log: operation(low('record', ['trace']))
        }
    }),
    element('the-store', 'store'),
    element('other-store', 'store')
];

const templates = [
    element('in-tx', 'execution-node-wrapper', { keyword: 'inTx', effects: { bound: ['read', 'write', 'trace'] }, implementation: { next: true } }),
    element('after-tx', 'execution-node-template', { keyword: 'afterTx', node: { '!afterTx': '@method' }, effects: { defers: true }, implementation: { set: null } })
];

const call = name => ({ invoke: 'the-store', operation: name });

const bootRunner = (implementation, data = {}, extra = []) => bootWith(store, templates, extra,
    kind('runner', { shape: { direct: 'boolean' }, operations: { run: operation(implementation, { target: '@ref/store' }) } }),
    element('the-runner', 'runner', data));

const problems = () => validate().map(({ code, data }) => [code, data.path ?? data.slot, data.effect]);

describe('effects', () => {
    it('requires a low node to declare its effects', async () => {
        await bootRunner({ low: { module: '@business-framework/core', export: 'x' } });
        expect(problems()).to.deep.equal([['undeclared-effects', 'operations.run.implementation', undefined]]);
    });

    it('infers the effects of an operation from what it reaches, with a trace', async () => {
        await bootRunner([call('get'), { if: '#.input.x', then: call('put'), else: call('log') }]);
        expect(effectsOf({ element: 'the-runner', operation: 'run' })).to.deep.equal(['read', 'write', 'trace']);
        expect(effectTracesOf({ element: 'the-runner', operation: 'run' }).write).to.equal('the-store.put > low record');
    });

    it('refuses an effect outside a template bound, but not one the template defers', async () => {
        await bootRunner({ inTx: [call('put'), call('send')] });
        expect(problems()).to.deep.equal([['effect-bound', 'operations.run.implementation', 'irreversible']]);

        await bootRunner({ inTx: [call('put'), { afterTx: call('send') }] });
        expect(problems()).to.deep.equal([]);
        expect(effectTracesOf({ element: 'the-runner', operation: 'run' }).irreversible).to.equal('afterTx > the-store.send > low record');
    });

    it('takes the branch a condition on self selects', async () => {
        const code = { inTx: { if: '#.self.data.direct', then: call('send'), else: call('put') } };
        await bootRunner(code, { direct: false });
        expect(problems()).to.deep.equal([]);
        await bootRunner(code, { direct: true });
        expect(problems()).to.deep.equal([['effect-bound', 'operations.run.implementation', 'irreversible']]);
    });

    it('resolves a target from a typed input reference over the instances of its kind', async () => {
        await bootRunner({ invoke: '#.input.target', operation: 'get' });
        expect(effectsOf({ element: 'the-runner', operation: 'run' })).to.deep.equal(['read']);
        await bootRunner({ invoke: '#.input.other', operation: 'get' });
        expect(effectsOf({ element: 'the-runner', operation: 'run' })).to.deep.equal(['read', 'write', 'irreversible']);
    });

    it('resolves a target from its inferred type: a reference built into an output, or read from a slot value', async () => {
        await bootRunner([
            { outputKey: 'picked', set: { store: '#.input.target' } },
            { invoke: '#.picked.store', operation: 'get' }
        ]);
        expect(effectsOf({ element: 'the-runner', operation: 'run' })).to.deep.equal(['read']);
        await bootRunner([
            { outputKey: 'targets', set: { '$func/slot-values': { element: '#.self.id', slot: 'targets' } } },
            { inputMap: '#.targets', forEach: { invoke: '#.item.store', operation: 'get' } }
        ], {}, [
            element('runner-targets', 'slot-declaration', { target: 'runner', slot: 'targets', cardinality: 'many', value: { '!store': '@ref/store' } }),
            element('a-target', 'slot-fill', { target: 'the-runner', slot: 'targets', value: { store: 'the-store' } })
        ]);
        expect(effectsOf({ element: 'the-runner', operation: 'run' })).to.deep.equal(['read']);
    });

    it('counts slot fills where the slot is read and checks them against the slot bound', async () => {
        const slots = [
            kind('checked', {
                slots: { checks: { cardinality: 'many', value: '@method', effects: ['read'] } },
                operations: { run: operation({ inputMap: { '$func/slot-values': { element: '#.self.id', slot: 'checks' } }, forEach: { execute: '#.item' } }) }
            }),
            element('the-checked', 'checked'),
            { id: 'reading-check', kind: 'slot-fill', data: { target: 'checked', slot: 'checks', value: call('get') } },
            { id: 'writing-check', kind: 'slot-fill', data: { target: 'checked', slot: 'checks', value: call('put') } }
        ];
        await bootRunner({ set: null }, {}, slots);
        expect(effectsOf({ element: 'the-checked', operation: 'run' })).to.deep.equal(['read', 'write']);
        expect(problems()).to.deep.equal([['effect-bound', 'checks', 'write']]);
    });

    it('counts the effects an operation reaches through a cycle entered elsewhere', async () => {
        const cycle = [
            kind('guarded', {
                slots: { guards: { cardinality: 'many', value: '@method', effects: ['read'] } },
                operations: {
                    create: operation({ invoke: '#.self.id', operation: 'apply' }),
                    update: operation({ invoke: '#.self.id', operation: 'apply' }),
                    apply: operation([{ inputMap: { '$func/slot-values': { element: '#.self.id', slot: 'guards' } }, forEach: { execute: '#.item' } }, call('put')])
                }
            }),
            element('the-guarded', 'guarded'),
            { id: 'updating-guard', kind: 'slot-fill', data: { target: 'guarded', slot: 'guards', value: { invoke: 'the-guarded', operation: 'update' } } }
        ];
        await bootRunner({ set: null }, {}, cycle);
        expect(effectsOf({ element: 'the-guarded', operation: 'update' })).to.deep.equal(['write']);
        expect(problems()).to.deep.equal([['effect-bound', 'guards', 'write']]);
    });
});
