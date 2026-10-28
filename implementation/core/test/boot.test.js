import { expect } from 'chai';
import { boot, invoke, validate } from '../src/index.js';
import { bootWith, element } from './helpers.js';

describe('boot', () => {
    it('loads the core elements, which validate against their own kinds', async () => {
        await boot();
        expect(validate()).to.deep.equal([]);
    });

    it('validates with schema operations defined in data', async () => {
        await boot();
        expect((await invoke('slot', 'validate', { cardinality: 'many', value: 'string' })).isValid).to.equal(true);
        expect((await invoke('slot', 'validate', { cardinality: 'some' })).isValid).to.equal(false);
    });

    it('refuses an element id that is not lowercase alphanumeric segments joined by hyphens', async () => {
        for (const id of ['Upper', 'with_underscore', 'with/slash', 'with.dot', '-leading', 'trailing-', 'double--hyphen']) {
            expect((await bootWith(element(id, 'data')).catch(e => e)).code, id).to.equal('invalid-id');
        }
        await bootWith(element('valid-id-2', 'data'));
    });
});
