import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';

describe('database', () => {
    it('validates', async () => {
        await boot({ paths: [packageElements('@business-framework/database')] });
        expect(validate()).to.deep.equal([]);
    });
});
