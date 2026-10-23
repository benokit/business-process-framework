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
            { set: { $id: '\\schema', $data: 'string', name: '#.a' } }
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
            { low: { module: '@business-framework/nothing', export: 'x' } }
        ])).to.deep.equal([
            ['unknown-element', `${PATH}[0]`],
            ['unknown-operation', `${PATH}[1]`],
            ['unknown-module', `${PATH}[5]`],
            ['unknown-function', `${PATH}[2].set`],
            ['unknown-function', `${PATH}[3].set`],
            ['unknown-slot', `${PATH}[4].set`]
        ]);
    });

    it('reports a binding of context the author does not manage, in code of slot fills too', async () => {
        await bootWith(
            kind('tenant-scope', { context: { manages: { tenant: 'string' } }, slots: { steps: { cardinality: 'many', value: '@method' } },
                operations: { run: operation({ withContext: { tenant: '\\a', user: '\\b' }, do: { set: 1 } }) } }),
            element('scope', 'tenant-scope'),
            element('step', 'slot-fill', { target: 'tenant-scope', slot: 'steps', value: { withContext: { tenant: '\\c' }, do: { set: 1 } } }));
        expect(validate().map(({ code, data }) => [code, data.element, data.key])).to.deep.equal([
            ['context-right', 'tenant-scope', 'user'],
            ['context-right', 'step', 'tenant']
        ]);
    });
});
