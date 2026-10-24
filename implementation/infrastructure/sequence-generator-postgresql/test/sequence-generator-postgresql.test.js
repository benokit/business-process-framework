import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { effectsOf } from '@business-framework/core/introspection';
import { skipWithoutPostgres } from '../../postgresql/test/helpers.js';

const SEQUENCE = `test-seq-${Date.now()}`;

const numbering = [
    { id: 'numbering', kind: 'kind', data: { operations: { number: { input: '@any', implementation: { nextFromSequence: SEQUENCE } } } } },
    { id: 'invoices', kind: 'numbering', data: {} }
];

describe('sequence-generator-postgresql', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({
            paths: ['@business-framework/integration', '@business-framework/database', '@business-framework/postgresql', '@business-framework/sequence-generator', '@business-framework/sequence-generator-postgresql'].map(packageElements),
            elements: numbering
        });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('infers the effect of the statements', () => {
        expect(effectsOf({ element: 'default-sequence-generator', operation: 'next' })).to.deep.equal(['write', 'irreversible']);
    });

    it('counts from 1, independently per sequence', async () => {
        const values = [
            await invoke('default-sequence-generator', 'next', { sequence: SEQUENCE }),
            await invoke('default-sequence-generator', 'next', { sequence: SEQUENCE }),
            await invoke('default-sequence-generator', 'next', { sequence: `${SEQUENCE}-other` })
        ];
        expect(values).to.deep.equal([{ value: 1 }, { value: 2 }, { value: 1 }]);
    });

    it('provides the nextFromSequence keyword', async () => {
        expect(await invoke('invoices', 'number', null)).to.equal(3);
    });

    it('rejects a sequence name with unsafe characters', async () => {
        expect((await invoke('default-sequence-generator', 'next', { sequence: "x'; drop" }).catch(e => e)).code).to.equal('invalid');
    });
});
