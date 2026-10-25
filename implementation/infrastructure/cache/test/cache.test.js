import { expect } from 'chai';
import { boot, invoke, packageElements, validate } from '@business-framework/core';
import { cacheClear } from '@business-framework/cache';

const cached = (cache, compute) => ({ withCache: compute, cache, key: '#.input.key' });

const service = {
    id: 'lookups',
    kind: 'kind',
    data: {
        operations: {
            plain: { input: { '!key': 'string' }, implementation: [{ outputKey: 'prefix', set: 'computed' }, cached('lasting', { set: { value: '#.prefix' } })] },
            other: { input: { '!key': 'string' }, implementation: [{ outputKey: 'prefix', set: 'fresh' }, cached('lasting', { set: { value: '#.prefix' } })] },
            brief: { input: { '!key': 'string', '!value': 'string' }, implementation: cached('brief', { set: { value: '#.input.value' } }) }
        }
    }
};

const elements = [
    service,
    { id: 'the-lookups', kind: 'lookups', data: {} },
    { id: 'lasting', kind: 'in-memory-cache', data: {} },
    { id: 'brief', kind: 'in-memory-cache', data: { ttl: 50 } },
    { id: 'small', kind: 'in-memory-cache', data: { maxEntries: 2 } }
];

describe('cache', () => {
    before(async () => {
        await boot({ paths: [packageElements('@business-framework/cache')], elements });
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

    it('recomputes after an eviction', async () => {
        await invoke('the-lookups', 'plain', { key: 'k3' });
        await invoke('lasting', 'evict', { key: 'k3' });
        expect(await invoke('the-lookups', 'other', { key: 'k3' })).to.deep.equal({ value: 'fresh' });
    });

    it('recomputes when the entry has expired', async () => {
        await invoke('the-lookups', 'brief', { key: 'k4', value: 'first' });
        expect(await invoke('the-lookups', 'brief', { key: 'k4', value: 'second' })).to.deep.equal({ value: 'first' });
        await new Promise(resolve => setTimeout(resolve, 60));
        expect(await invoke('the-lookups', 'brief', { key: 'k4', value: 'third' })).to.deep.equal({ value: 'third' });
    });

    it('removes the least recently used entry beyond maxEntries', async () => {
        const found = async key => (await invoke('small', 'get', { key })).found;
        await invoke('small', 'set', { key: 'a', value: 1 });
        await invoke('small', 'set', { key: 'b', value: 2 });
        await found('a');
        await invoke('small', 'set', { key: 'c', value: 3 });
        expect([await found('a'), await found('b'), await found('c')]).to.deep.equal([true, false, true]);
    });
});
