import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';

describe('search', () => {
    it('validates', async () => {
        await boot({ paths: [packageElements('@business-framework/search')] });
        expect(validate()).to.deep.equal([]);
    });
});
