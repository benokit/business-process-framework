import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'users'];

describe('users', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)) });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('creates users as entities, keyed by subject and active', async () => {
        const subject = `ada-${run}`;
        const created = await invoke('user', 'create', { body: { subject, username: 'ada', email: 'ada@test' } });
        expect([created.businessKey, created.revision, created.data]).to.deep.equal([subject, 1, { body: { subject, username: 'ada', email: 'ada@test' }, state: { status: 'active' } }]);
    });
});
