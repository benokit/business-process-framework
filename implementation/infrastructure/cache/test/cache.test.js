import { expect } from 'chai';
import { boot, invoke, packageElements, validate } from '@business-framework/core';
import { cacheClear } from '@business-framework/cache';

const cached = (compute, extra = {}) => ({
    withCache: compute,
    cache: 'local-l1',
    key: '#.input.key',
    ...extra
});

const service = {
    id: 'lookups',
    kind: 'kind',
    data: {
        operations: {
            plain: { input: { '!key': 'string' }, implementation: [{ outputKey: 'prefix', set: '\\computed' }, cached({ set: { value: '#.prefix' } })] },
            checked: {
                input: { '!key': 'string', '!revision': 'number' },
                implementation: [{ outputKey: 'prefix', set: '\\computed' }, cached({ set: { revision: '#.input.revision', value: '#.prefix' } }, { validate: { $eq: ['#.cached.revision', '#.input.revision'] } })]
            },
            other: { input: { '!key': 'string' }, implementation: [{ outputKey: 'prefix', set: '\\fresh' }, cached({ set: { value: '#.prefix' } })] }
        }
    }
};

describe('cache', () => {
    before(async () => {
        await boot({ paths: [packageElements('@business-framework/cache')], elements: [service, { id: 'the-lookups', kind: 'lookups', data: {} }] });
    });

    beforeEach(cacheClear);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it("computes in the caller's context on a miss", async () => {
        expect(await invoke('the-lookups', 'plain', { key: 'k1' })).to.deep.equal({ value: 'computed' });
    });

    it('returns the cached value on a hit', async () => {
        await invoke('the-lookups', 'plain', { key: 'k2' });
        expect(await invoke('the-lookups', 'other', { key: 'k2' })).to.deep.equal({ value: 'computed' });
    });

    it('recomputes when validate is false', async () => {
        await invoke('the-lookups', 'checked', { key: 'k3', revision: 1 });
        expect(await invoke('the-lookups', 'checked', { key: 'k3', revision: 2 })).to.deep.equal({ revision: 2, value: 'computed' });
    });

    it('returns the cached value when validate is true', async () => {
        await invoke('the-lookups', 'checked', { key: 'k4', revision: 5 });
        expect(await invoke('the-lookups', 'checked', { key: 'k4', revision: 5 })).to.deep.equal({ revision: 5, value: 'computed' });
    });
});
