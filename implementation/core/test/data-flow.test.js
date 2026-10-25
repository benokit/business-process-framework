import { expect } from 'chai';
import { validate } from '../src/index.js';
import { bootWith, element, kind, operation, runner } from './helpers.js';

const PATH = 'operations.run.implementation';

const problemsOf = (options = {}) => validate(options).map(({ code, data }) => [code, data.path]);

describe('data flow', () => {
    it('knows the keys of the scope: input, self, _ctx and the outputs before a node', async () => {
        await bootWith(runner([
            { outputKey: 'record', set: { id: 1 } },
            { set: '#.record.id' },
            { set: '#.recrod.id' },
            { if: true, then: { outputKey: 'inner', set: 1 } },
            { set: '#.inner' },
            { set: '#.record.name' }
        ]));
        expect(problemsOf()).to.deep.equal([
            ['unknown-path', `${PATH}[2].set`],
            ['unknown-path', `${PATH}[4].set`],
            ['unknown-path', `${PATH}[5].set`]
        ]);
    });

    it('knows the item of forEach, the error of catch and only the context keys some kind manages', async () => {
        await bootWith(
            kind('tenant-scope', { context: { manages: { tenant: 'string' } } }),
            runner([
                { inputMap: [1, 2], forEach: { set: '#.item' } },
                { set: '#.item' },
                { try: { throw: 'boom' }, catch: { set: '#.error.message' } },
                { set: '#._ctx.tenant' },
                { set: '#._ctx.tennant' }
            ]));
        expect(problemsOf()).to.deep.equal([
            ['unknown-path', `${PATH}[1].set`],
            ['unknown-path', `${PATH}[4].set`]
        ]);
    });

    it('types the input by the contract, the output of an invoke by its contract and pure functions by their signature', async () => {
        await bootWith(
            kind('pricing', { operations: { status: operation({ set: { state: 'open' } }, '@any', { '!state=1': ['open', 'closed'] }) } }),
            element('the-pricing', 'pricing'),
            element('double', 'pure-function', { signature: { input: 'number', output: 'number' }, mapping: { $multiply: ['#', 2] } }),
            kind('runner', { operations: { run: operation([
                { set: { $sum: ['#.input.amount', 1] } },
                { set: { $sum: ['#.input.note', 1] } },
                { outputKey: 'status', invoke: 'the-pricing', operation: 'status' },
                { set: { $eq: ['#.status.state', 'archived'] } },
                { set: { '$func/double': '#.input.note' } }
            ], { '!amount': 'number', '!note': 'string' }) } }),
            element('the-runner', 'runner'));
        expect(problemsOf()).to.deep.equal([
            ['type-mismatch', `${PATH}[1].set.$sum[0]`],
            ['type-mismatch', `${PATH}[4].set.$func/double`]
        ]);
        expect(problemsOf({ warnings: true })).to.deep.include(['impossible-comparison', `${PATH}[3].set.$eq`]);
    });

    it("runs a wrapper's pipeline in the enclosing scope and a template's method in a scope of its own", async () => {
        await bootWith(
            element('around-wrapper', 'execution-node-wrapper', { keyword: 'around', node: { '!around': '@method' }, implementation: { next: true } }),
            element('later-template', 'execution-node-template', { keyword: 'later', node: { '!later': '@method' }, implementation: { set: '#.node.later' } }),
            runner([
                { outputKey: 'outer', set: 1 },
                { around: { set: '#.outer' } },
                { later: { set: '#.outer' } }
            ]));
        expect(problemsOf()).to.deep.equal([['unknown-path', `${PATH}[2].later.set`]]);
    });

    it('types the output of a template by its implementation and of a wrapper by the pipeline it runs, returns included', async () => {
        await bootWith(
            element('around-wrapper', 'execution-node-wrapper', { keyword: 'around', node: { '!around': '@method' }, implementation: { next: true } }),
            element('pair-template', 'execution-node-template', { keyword: 'pair', node: { '!pair': 'string' }, implementation: { set: { left: 1, right: 2 } } }),
            runner([
                { outputKey: 'pair', pair: 'x' },
                { set: '#.pair.left' },
                { set: '#.pair.middle' },
                { outputKey: 'wrapped', around: [{ return: { inner: 1 } }, { set: 2 }] },
                { set: '#.wrapped.inner' },
                { set: '#.wrapped.outer' }
            ]));
        expect(problemsOf()).to.deep.equal([
            ['unknown-path', `${PATH}[2].set`],
            ['unknown-path', `${PATH}[5].set`]
        ]);
    });

    it('gives the code of a slot fill the input its slot declares', async () => {
        await bootWith(
            kind('stepper', { slots: { steps: { cardinality: 'many', value: '@method', input: { '!count': 'number', '!label': 'string' } } } }),
            element('the-stepper', 'stepper'),
            element('step', 'slot-fill', { target: 'stepper', slot: 'steps', value: { set: { $sum: ['#.input.count', '#.input.label'] } } }));
        expect(problemsOf()).to.deep.equal([['type-mismatch', 'value.set.$sum[1]']]);
    });

    it('reads declared objects of contracts and shapes as closed, and maps as open', async () => {
        await bootWith(
            kind('runner', { shape: { limit: 'number' }, operations: { run: operation([
                { set: '#.input.amout' },
                { set: '#.input.extras.discount' },
                { set: '#.input.traits.state' },
                { set: '#.self.data.limt' }
            ], { '!amount': 'number', 'extras{}': 'number', traits: { '!body': 'object', '*': '@any' } }) } }),
            element('the-runner', 'runner'));
        expect(problemsOf()).to.deep.equal([
            ['unknown-path', `${PATH}[0].set`],
            ['unknown-path', `${PATH}[3].set`]
        ]);
    });

    it("gives a kind's validate hook the self of its instances", async () => {
        await bootWith(kind('ranged', { shape: { '!min': 'number' }, lifecycle: { validate: { $if: [{ $gt: ['#.self.data.min', '#.selff.data.min'] }, ['x'], []] } } }));
        expect(problemsOf()).to.deep.equal([['unknown-path', 'lifecycle.validate.$if[0].$gt[1]']]);
    });
});
