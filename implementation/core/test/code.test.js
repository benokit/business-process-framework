import { expect } from 'chai';
import { validate } from '../src/index.js';
import { bootWith, element, kind, low, operation, runner } from './helpers.js';

const problemsOf = async implementation => {
    await bootWith(runner(implementation));
    return validate().map(({ code, data }) => [code, data.path]);
};

const PATH = 'operations.run.implementation';

describe('code checks', () => {
    it('accepts well-formed code', async () => {
        expect(await problemsOf([
            { outputKey: 'a', set: { $let: { $twice: { $multiply: ['#', 2] } }, $twice: 3 } },
            { if: true, then: { set: { $literal: { $anything: 1 } } }, else: low('record') },
            { invoke: 'the-runner', operation: 'run', inputMap: '#.a' },
            { set: { '\\$id': 'schema', '\\$data': 'string', name: '#.a' } }
        ])).to.deep.equal([]);
    });

    it('reports node structure: unknown and ambiguous keywords, foreign keys, _ctx outputs', async () => {
        expect(await problemsOf([
            { iff: true },
            { set: 1, invoke: 'the-runner' },
            { if: true, thn: { set: 1 } },
            { try: [{ sett: 1 }], catch: { set: 1 } },
            { outputKey: '_ctx', set: 1 }
        ])).to.deep.equal([
            ['unknown-keyword', `${PATH}[0]`],
            ['ambiguous-node', `${PATH}[1]`],
            ['unknown-node-key', `${PATH}[2]`],
            ['unknown-keyword', `${PATH}[3].try[0]`],
            ['context-write', `${PATH}[4]`]
        ]);
    });

    it('reports next in an operation, where no middleware runs', async () => {
        expect(await problemsOf({ next: true })).to.deep.equal([['next-outside-middleware', PATH]]);
    });

    it('reports unknown elements, operations, functions, slots and modules', async () => {
        expect(await problemsOf([
            { invoke: 'nobody', operation: 'run' },
            { invoke: 'the-runner', operation: 'walk' },
            { set: { $coalese: ['#', 1] } },
            { set: { '$func/nothing': '#' } },
            { set: { '$func/slot-values': { element: '#.self.id', slot: 'nothing' } } },
            { low: { module: '@business-framework/nothing', export: 'x', effects: [] } }
        ])).to.deep.equal([
            ['unknown-element', `${PATH}[0]`],
            ['unknown-operation', `${PATH}[1]`],
            ['unknown-module', `${PATH}[5]`],
            ['unknown-function', `${PATH}[2].set.$coalese`],
            ['unknown-function', `${PATH}[3].set.$func/nothing`],
            ['unknown-slot', `${PATH}[4].set`]
        ]);
    });

    it('reports malformed mappings: calls beside data, unknown parameters, needless escapes', async () => {
        expect(await problemsOf([
            { set: { $head: '#.a', name: 'x' } },
            { set: { $join: { _strings: ['a', 'b'] } } },
            { inputMap: { $str: ['\\plain', '#.a'] }, set: '#' }
        ])).to.deep.equal([
            ['mixed-call', `${PATH}[0].set`],
            ['unknown-parameter', `${PATH}[1].set.$join._strings`],
            ['needless-escape', `${PATH}[2].inputMap.$str[0]`]
        ]);
    });

    it('reports a binding of context the author does not manage, in code of slot fills too', async () => {
        await bootWith(
            kind('tenant-scope', { context: { manages: { tenant: 'string' } }, slots: { steps: { cardinality: 'many', value: '@method' } },
                operations: { run: operation({ withContext: { tenant: 'a', user: 'b' }, do: { set: 1 } }) } }),
            element('scope', 'tenant-scope'),
            element('step', 'slot-fill', { target: 'tenant-scope', slot: 'steps', value: { withContext: { tenant: 'c' }, do: { set: 1 } } }));
        expect(validate().map(({ code, data }) => [code, data.element, data.key])).to.deep.equal([
            ['context-right', 'tenant-scope', 'user'],
            ['context-right', 'step', 'tenant']
        ]);
    });

    it('checks template nodes against their node shape, with the code and references in them', async () => {
        await bootWith(
            runner([
                { notify: 'the-runner', level: 'loud' },
                { notify: 'nobody', tone: 'x' },
                { notify: 'the-runner', then: { if: true, thn: 1 } }
            ]),
            element('notify-template', 'execution-node-template', {
                keyword: 'notify',
                node: { '!notify': '@ref/runner', 'level=1': ['quiet', 'normal'], then: '@method' },
                implementation: { set: '#.node.notify' }
            }));
        expect(validate().map(({ code, data }) => [code, data.path])).to.deep.equal([
            ['invalid-node', `${PATH}[0]`],
            ['unknown-node-key', `${PATH}[1]`],
            ['unknown-element', `${PATH}[1].notify`],
            ['unknown-node-key', `${PATH}[2].then`]
        ]);
    });

    it('reports a reference in element data that names no instance of the expected kind', async () => {
        await bootWith(
            kind('channel', {}),
            element('orders', 'channel'),
            kind('listener', { shape: { '!channel': '@ref/channel' } }),
            element('good', 'listener', { channel: 'orders' }),
            element('typo', 'listener', { channel: 'order' }),
            element('wrong', 'listener', { channel: 'good' }));
        expect(validate().map(({ code, data }) => [code, data.element])).to.deep.equal([
            ['unknown-element', 'typo'],
            ['invalid-reference', 'wrong']
        ]);
    });

    it('checks references to any element, to a kind and to a kind extending another', async () => {
        await bootWith(
            kind('channel', {}),
            kind('fast-channel', { extends: 'channel' }),
            element('orders', 'channel'),
            kind('wiring', { shape: { '!anything': '@ref', '!kindOf': '@ref/kind', '!channelKind': '@ref/kind/channel' } }),
            element('good', 'wiring', { anything: 'orders', kindOf: 'channel', channelKind: 'fast-channel' }),
            element('bad', 'wiring', { anything: 'nothing', kindOf: 'orders', channelKind: 'wiring' }));
        expect(validate().map(({ code, data }) => [code, data.element, data.path])).to.deep.equal([
            ['unknown-element', 'bad', 'anything'],
            ['invalid-reference', 'bad', 'kindOf'],
            ['invalid-reference', 'bad', 'channelKind']
        ]);
    });
});
