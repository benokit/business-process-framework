import { expect } from 'chai';
import { invoke, validate } from '../src/index.js';
import { bootWith, element, kind, operation } from './helpers.js';

const store = [
    kind('store', { operations: { put: operation(undefined, { '!value': 'number' }, 'string') } }),
    kind('memory-store', { extends: 'store', operations: { put: { implementation: { set: '\\memory' } } } }),
    kind('disk-store', { extends: 'store', operations: { put: { implementation: { set: '\\disk' } } } })
];

const binding = (abstraction, instance) => ({ kind: 'binding', data: { abstraction, instance } });

const codes = () => validate().map(problem => problem.code);

describe('interfaces', () => {
    it('runs the implementation of an abstract operation under the interface contract', async () => {
        await bootWith(store, element('memory', 'memory-store'));
        expect(await invoke('memory', 'put', { value: 1 })).to.equal('memory');
        const error = await invoke('memory', 'put', { value: 'x' }).catch(e => e);
        expect(error.code).to.equal('invalid');
    });

    it('fails to invoke an abstract operation nobody implements', async () => {
        await bootWith(store, element('raw', 'store'));
        const error = await invoke('raw', 'put', { value: 1 }).catch(e => e);
        expect(error.code).to.equal('unimplemented-operation');
        expect(codes()).to.deep.equal(['unimplemented-operation']);
    });

    it('fails to boot when an implementation is implemented again', async () => {
        const error = await bootWith(store,
            kind('fast-memory-store', { extends: 'memory-store', operations: { put: { implementation: { set: 1 } } } })).catch(e => e);
        expect(error).to.match(/may not redefine operation 'put'/);
    });

    it('fails to boot when an implementation changes the contract', async () => {
        const error = await bootWith(store,
            kind('other-store', { extends: 'store', operations: { put: operation({ set: 1 }) } })).catch(e => e);
        expect(error).to.match(/may not redefine operation 'put'/);
    });

    it('fails to boot when an operation implements nothing and declares no input', async () => {
        const error = await bootWith(kind('loose', { operations: { run: { implementation: { set: 1 } } } })).catch(e => e);
        expect(error).to.match(/declares no input/);
    });

    it('resolves instanceOf to the only instance of the kind, subkinds included', async () => {
        await bootWith(store, element('disk', 'disk-store'));
        expect(await invoke({ instanceOf: 'store' }, 'put', { value: 1 })).to.equal('disk');
    });

    it('resolves instanceOf through a binding when there are several instances', async () => {
        await bootWith(store, element('memory', 'memory-store'), element('disk', 'disk-store'), binding('store', 'disk'));
        expect(await invoke({ instanceOf: 'store' }, 'put', { value: 1 })).to.equal('disk');
        expect(await invoke('memory', 'put', { value: 1 })).to.equal('memory');
    });

    it('reports an ambiguous reference at the call and in validate()', async () => {
        await bootWith(store, element('memory', 'memory-store'), element('disk', 'disk-store'),
            kind('user', {}), element('a-user', 'user', { store: { instanceOf: 'store' } }));
        const error = await invoke({ instanceOf: 'store' }, 'put', { value: 1 }).catch(e => e);
        expect(error.code).to.equal('ambiguous-reference');
        expect(codes()).to.deep.equal(['ambiguous-reference']);
    });

    it('reports a reference to a kind without instances', async () => {
        await bootWith(store, kind('user', {}), element('a-user', 'user', { store: { instanceOf: 'store' } }));
        expect(codes()).to.deep.equal(['no-instance']);
    });

    it('accepts a reference without instances in the code of a kind', async () => {
        await bootWith(store, kind('user', { operations: { save: operation({ invoke: { instanceOf: 'store' }, operation: 'put' }) } }));
        expect(codes()).to.deep.equal([]);
    });

    it('accepts a reference without instances in code outside kinds, and reports one in data', async () => {
        await bootWith(store,
            kind('job', { shape: { run: '@method', target: '@element-ref' }, slots: { steps: { cardinality: 'many', value: '@method' } } }),
            element('nightly', 'job', { run: { invoke: { instanceOf: 'store' }, operation: 'put' }, target: { instanceOf: 'store' } }),
            { kind: 'slot-fill', data: { target: 'job', slot: 'steps', value: { invoke: { instanceOf: 'store' }, operation: 'put' } } });
        expect(validate().map(({ code, data }) => [code, data.abstraction])).to.deep.equal([['no-instance', 'store']]);
    });

    it('reports a reference in code to an element that is not a kind', async () => {
        await bootWith(kind('user', { operations: { save: operation({ invoke: { instanceOf: 'stor' }, operation: 'put' }) } }));
        expect(codes()).to.deep.equal(['unknown-kind']);
    });

    it('reports a binding to an element that is not an instance of the abstraction', async () => {
        await bootWith(store, element('memory', 'memory-store'), kind('other', {}), element('stranger', 'other'), binding('store', 'stranger'));
        expect(codes()).to.deep.equal(['invalid-binding']);
    });

    it('reports two bindings of one abstraction', async () => {
        await bootWith(store, element('memory', 'memory-store'), element('disk', 'disk-store'),
            binding('store', 'memory'), binding('store', 'disk'),
            kind('user', {}), element('a-user', 'user', { store: { instanceOf: 'store' } }));
        expect(codes()).to.deep.equal(['ambiguous-binding']);
    });
});
