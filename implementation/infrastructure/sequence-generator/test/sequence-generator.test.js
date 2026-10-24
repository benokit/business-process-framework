import { expect } from 'chai';
import { boot, interpret, invoke, packageElements, validate } from '@business-framework/core';

const numbering = [
    { id: 'numbering', kind: 'kind', data: { operations: { number: { input: '@any', implementation: { nextFromSequence: 'invoice-number' } } } } },
    { id: 'invoices', kind: 'numbering', data: {} }
];

describe('sequence-generator', () => {
    before(async () => {
        await boot({ paths: ['integration', 'database', 'sequence-generator'].map(name => packageElements(`@business-framework/${name}`)), elements: numbering });
        interpret({ effects: [], stubs: { 'next-sequence-value': { run: ({ input }) => ({ value: input.sequence.length }) } } });
    });

    after(() => interpret());

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('provides the nextFromSequence keyword', async () => {
        expect(await invoke('invoices', 'number', null)).to.equal('invoice-number'.length);
    });

    it('rejects a sequence name with unsafe characters', async () => {
        expect((await invoke('sequences', 'next', { sequence: "x'; drop" }).catch(e => e)).code).to.equal('invalid');
    });
});
