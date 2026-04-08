import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';
import { cacheClear } from '@business-framework/cache';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR = join(__dirname, '../elements');
const SERVICE = 'test-with-cache';

describe('cache', function () {

    before(async function () {
        await loadElements([ELEMENTS_DIR]);

        registerElement({
            kind: 'service',
            id: SERVICE,
            data: {
                interface: {
                    getByKey:      { input: { '!key': 'string' } },
                    getWithExpiry: { input: { '!key': 'string', '!revision': 'number' } },
                    noValidate:    { input: { '!key': 'string' } }
                },
                implementation: {
                    getByKey: {
                        withCache: {
                            cache: 'local-l1',
                            key: '#.input.key',
                            compute: { set: { value: 'computed' } }
                        }
                    },
                    getWithExpiry: {
                        withCache: {
                            cache: 'local-l1',
                            key: '#.input.key',
                            validate: { '$eq': ['#.cached.revision', '#.input.revision'] },
                            compute: { set: { revision: '#.input.revision', value: 'computed' } }
                        }
                    },
                    noValidate: {
                        withCache: {
                            cache: 'local-l1',
                            key: '#.input.key',
                            compute: { set: { value: 'fresh' } }
                        }
                    }
                }
            }
        });
    });

    beforeEach(function () {
        cacheClear();
    });

    it('computes and caches on first call', async () => {
        const result = await executeService(SERVICE, 'getByKey', { key: 'k1' });
        expect(result).to.deep.equal({ value: 'computed' });
    });

    it('returns cached value on second call', async () => {
        await executeService(SERVICE, 'getByKey', { key: 'k2' });
        const result = await executeService(SERVICE, 'getByKey', { key: 'k2' });
        expect(result).to.deep.equal({ value: 'computed' });
    });

    it('recomputes when validate returns false', async () => {
        await executeService(SERVICE, 'getWithExpiry', { key: 'k3', revision: 1 });
        const result = await executeService(SERVICE, 'getWithExpiry', { key: 'k3', revision: 2 });
        expect(result).to.deep.equal({ revision: 2, value: 'computed' });
    });

    it('returns cached value when validate returns true', async () => {
        await executeService(SERVICE, 'getWithExpiry', { key: 'k4', revision: 5 });
        const result = await executeService(SERVICE, 'getWithExpiry', { key: 'k4', revision: 5 });
        expect(result).to.deep.equal({ revision: 5, value: 'computed' });
    });

    it('returns cached value when no validate is specified', async () => {
        await executeService(SERVICE, 'noValidate', { key: 'k5' });
        const result = await executeService(SERVICE, 'noValidate', { key: 'k5' });
        expect(result).to.deep.equal({ value: 'fresh' });
    });

});
