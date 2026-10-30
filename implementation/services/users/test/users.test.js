import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'http-server', 'security', 'authorization', 'entities-http', 'entity-states-http', 'users'];

const elements = [
    { id: 'clerk-actor', kind: 'actor', data: { grants: [] } },
    { id: 'clerk-role', kind: 'role', data: { actors: ['clerk-actor'] } }
];

describe('users', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('creates users as entities, keyed by subject and active', async () => {
        const subject = `ada-${run}`;
        const created = await invoke('user', 'create', { traits: { body: { subject, username: 'ada', email: 'ada@test' } } });
        expect([created.businessKey, created.revision, created.data]).to.deep.equal([subject, 1, { body: { subject, username: 'ada', email: 'ada@test' }, state: { status: 'active' } }]);
    });

    it('holds only declared roles', async () => {
        const subject = `bob-${run}`;
        const created = await invoke('user', 'create', { traits: { body: { subject, roles: ['clerk-role'] } } });
        const error = await invoke('entity-bodies', 'put', { entityType: 'user', businessKey: subject, revision: created.revision, value: { subject, roles: ['clerk-role', 'root', 'clerk-actor'] } }).catch(e => e);
        expect([error.code, error.message]).to.deep.equal(['invalid', 'unknown roles: root, clerk-actor']);
        expect((await invoke('user', 'create', { traits: { body: { subject: `carl-${run}`, roles: ['root'] } } }).catch(e => e)).message).to.equal('unknown roles: root');
    });
});
