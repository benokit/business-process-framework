import { expect } from 'chai';
import { boot, invoke, validate } from '../src/index.js';

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
});
