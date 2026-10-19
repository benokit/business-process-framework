import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const ADMIN = `admin-${run}`;

const packages = ['database', 'postgresql', 'transaction', 'entities', 'entity-states', 'security', 'users'];

describe('users', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({
            paths: packages.map(name => packageElements(`@business-framework/${name}`)),
            elements: [{ kind: 'app-config', data: { users: { adminUsername: ADMIN, adminPassword: 'secret', adminEmail: 'admin@test' } } }]
        });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('creates the admin account on start, with a hashed password', async () => {
        const admin = await invoke('user', 'read', { businessKey: ADMIN });
        expect(admin.data.body).to.include({ username: ADMIN, email: 'admin@test' });
        expect(admin.data.body.roles).to.deep.equal(['admin']);
        expect(await invoke('password', 'verify', { password: 'secret', hash: admin.data.body.passwordHash })).to.equal(true);
        expect(await invoke('password', 'verify', { password: 'wrong', hash: admin.data.body.passwordHash })).to.equal(false);
    });

    it('keys users by username and sets passwords', async () => {
        const created = await invoke('user', 'create', { body: { username: `ada-${run}`, email: 'ada@test' } });
        expect(created.businessKey).to.equal(`ada-${run}`);
        const updated = await invoke('user', 'set-password', { businessKey: created.businessKey, password: 'pw' });
        expect(updated.revision).to.equal(2);
        expect(updated.data.body.passwordHash).to.match(/^[0-9a-f]+:[0-9a-f]+$/);
    });
});
