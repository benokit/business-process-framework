import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';

describe('search', () => {
    it('validates', async () => {
        await boot({ paths: ['@business-framework/integration', '@business-framework/search'].map(packageElements) });
        expect(validate()).to.deep.equal([]);
    });
});
