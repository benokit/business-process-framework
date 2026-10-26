import { expect } from 'chai';
import { fileURLToPath } from 'url';
import { invoke, validate } from '@business-framework/core';
import { installedPackages, startServer } from '@business-framework/server';
import { skipWithoutPostgres } from '../../infrastructure/postgresql/test/helpers.js';
import { skipWithoutMeilisearch } from '../../infrastructure/meilisearch/test/helpers.js';
import { skipWithoutIdentityProvider, tokenFor } from '../../framework/oauth/test/helpers.js';

const DEMO = fileURLToPath(new URL('../../../demo', import.meta.url));
const run = Date.now();

const call = async (method, path, body, token, headers = {}) => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...headers },
        ...(body && { body: JSON.stringify(body) })
    });
    return { status: response.status, body: await response.json() };
};

describe('server with the demo', function () {
    let stop = async () => null;

    before(async function () {
        await skipWithoutPostgres(this);
        await skipWithoutMeilisearch(this);
        await skipWithoutIdentityProvider(this);
        stop = await startServer({ paths: [DEMO], elements: [{ kind: 'app-config', data: { http: { port: 0 } } }] });
    });

    after(() => stop());

    it('loads every installed package with elements', async () => {
        expect(await installedPackages()).to.include.members(['@business-framework/entities', '@business-framework/server']);
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    const userWith = async (subject, roles) => {
        await invoke('user', 'create', { body: { subject, roles } });
        return tokenFor(subject);
    };

    it('refuses a request without a token, or of a subject that is no user', async () => {
        const stranger = await tokenFor(`stranger-${run}`);
        expect([(await call('GET', '/entity-types')).status, (await call('GET', '/entity-types', null, stranger)).status]).to.deep.equal([401, 401]);
    });

    it('lets a viewer read and refuses its changes', async () => {
        const token = await userWith(`viewer-${run}`, ['viewer-role']);
        expect((await call('GET', '/entities/party', null, token)).status).to.equal(200);
        expect((await call('POST', '/entities/party', { businessKey: `v-${run}`, body: { partyType: 'person', name: 'Bo' } }, token)).status).to.equal(403);
    });

    it('runs a contract through its lifecycle as an underwriter, who may not activate it', async () => {
        const token = await userWith(`underwriter-${run}`, ['underwriter-role']);
        const party = await call('POST', '/entities/party', { businessKey: `p-${run}`, body: { partyType: 'person', name: 'Ada' } }, token);
        expect(party.status).to.equal(201);
        const contract = await call('POST', '/entities/construction', {
            body: { policyholder: `p-${run}`, project: 'bridge', currency: 'EUR', startDate: '2026-01-01', endDate: '2027-01-01' }
        }, token);
        expect([contract.status, contract.body.businessKey]).to.satisfy(([status, key]) => status === 201 && /^CON-\d{4}-\d{4,}$/.test(key));
        const key = contract.body.businessKey;
        const issued = await call('POST', `/entities/construction/${key}/transitions/issue`, null, token, { 'if-match': `"${contract.body.revision}"` });
        expect(issued.body.data.state.status).to.equal('issued');
        const activated = await call('POST', `/entities/construction/${key}/transitions/activate`, null, token, { 'if-match': `"${issued.body.revision}"` });
        expect(activated.status).to.equal(403);
        const late = await call('PUT', `/entities/construction/${key}`, { body: contract.body.data.body }, token, { 'if-match': `"${issued.body.revision}"` });
        expect([late.status, late.body.error.message]).to.deep.equal([409, 'insurance contracts can only be updated in draft']);
    });
});
