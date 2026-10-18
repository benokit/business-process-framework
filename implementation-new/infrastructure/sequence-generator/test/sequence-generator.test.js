import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../postgresql/test/helpers.js';

const SEQUENCE = `test-seq-${Date.now()}`;

const numbering = [
    { id: 'numbering', kind: 'kind', data: { operations: { number: { input: '@any', implementation: { nextFromSequence: SEQUENCE } } } } },
    { id: 'invoices', kind: 'numbering', data: {} }
];

describe('sequence-generator', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({
            paths: ['@business-framework/postgresql', '@business-framework/sequence-generator'].map(packageElements),
            elements: numbering
        });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('counts from 1, independently per sequence', async () => {
        const values = [
            await invoke('sequences', 'next', { sequence: SEQUENCE }),
            await invoke('sequences', 'next', { sequence: SEQUENCE }),
            await invoke('sequences', 'next', { sequence: `${SEQUENCE}-other` })
        ];
        expect(values).to.deep.equal([{ value: 1 }, { value: 2 }, { value: 1 }]);
    });

    it('provides the nextFromSequence keyword', async () => {
        expect(await invoke('invoices', 'number', null)).to.equal(3);
    });

    it('rejects a sequence name with unsafe characters', async () => {
        expect((await invoke('sequences', 'next', { sequence: "x'; drop" }).catch(e => e)).code).to.equal('invalid');
    });
});
