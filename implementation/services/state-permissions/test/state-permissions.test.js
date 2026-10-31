import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { ROLE_HEADER, headerPrincipal } from '../../authorization/test/principal.js';
import { statePermissionExplanation } from '../src/state-permissions.js';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const DOCUMENT = `document-${run}`;

const packages = [
    'integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'http-server', 'security', 'authorization',
    'entities-http', 'entity-states', 'entity-states-http', 'state-permissions'
];

const lifecycle = {
    states: { status: { draft: true, submitted: true, approved: true } },
    transitions: { submit: { status: { draft: 'submitted' } }, approve: { status: { submitted: 'approved' } } },
    initialStates: { default: { status: 'draft' } }
};

const grant = (role, grants) => [
    { id: `${role}-actor`, kind: 'actor', data: { grants } },
    { id: `${role}-role`, kind: 'role', data: { actors: [`${role}-actor`] } }
];

const elements = [
    { kind: 'app-config', data: { 'http-server': { port: 0 } } },
    { id: DOCUMENT, kind: 'stateful-entity-type', data: { traits: { body: { configuration: { schema: { '!title': 'string' } } } } } },
    { id: `${DOCUMENT}-lifecycle`, kind: 'slot-fill', data: { target: DOCUMENT, slot: 'traits', value: { trait: 'state', configuration: lifecycle } } },
    ...grant('author', [
        { area: 'entities', resource: DOCUMENT, action: 'read' },
        { area: 'entities', resource: DOCUMENT, action: ['create', 'update'], state: 'draft' },
        { area: 'states', resource: DOCUMENT, action: 'submit' }
    ]),
    ...grant('approver', [
        { area: 'entities', resource: DOCUMENT, action: 'read' },
        { area: 'states', resource: DOCUMENT, action: 'approve' }
    ]),
    ...headerPrincipal
];

const call = async (role, method, path, { body, headers = {} } = {}) => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { 'content-type': 'application/json', [ROLE_HEADER]: `${role}-role`, ...headers },
        ...(body && { body: JSON.stringify(body) })
    });
    return { status: response.status, etag: response.headers.get('etag'), body: await response.json() };
};

const update = async (role, businessKey, title) => call(role, 'PUT', `/entities/${DOCUMENT}/${businessKey}`, {
    body: { body: { title } },
    headers: { 'if-match': (await call(role, 'GET', `/entities/${DOCUMENT}/${businessKey}`)).etag }
});

const transition = async (role, businessKey, name) => call(role, 'POST', `/entities/${DOCUMENT}/${businessKey}/transitions/${name}`, {
    headers: { 'if-match': (await call(role, 'GET', `/entities/${DOCUMENT}/${businessKey}`)).etag }
});

describe('state-permissions', function () {
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

    it('lets a role modify a record in the permission states it is granted', async () => {
        expect((await call('author', 'POST', `/entities/${DOCUMENT}`, { body: { businessKey: 'd-1', body: { title: 'first' } } })).status).to.equal(201);
        expect((await update('author', 'd-1', 'second')).status).to.equal(200);
    });

    it('refuses a modification in a permission state the role is not granted, and allows what the state allows', async () => {
        expect((await transition('author', 'd-1', 'submit')).status).to.equal(200);
        expect((await update('author', 'd-1', 'third')).status).to.equal(403);
        expect((await call('author', 'GET', `/entities/${DOCUMENT}/d-1`)).body.data.body.title).to.equal('second');
    });

    it('does not grant what the boundary does not permit in any state', async () => {
        expect((await update('approver', 'd-1', 'fourth')).status).to.equal(403);
        expect((await transition('approver', 'd-1', 'approve')).status).to.equal(200);
    });

    it('explains which roles may modify in each permission state', () => {
        expect(statePermissionExplanation(DOCUMENT)).to.deep.equal({ statePermissions: {
            draft: { update: ['author-role'], submit: ['author-role'], approve: ['approver-role'] },
            submitted: { submit: ['author-role'], approve: ['approver-role'] },
            approved: { submit: ['author-role'], approve: ['approver-role'] }
        } });
    });

    it('checks no call without an operation of a request', async () => {
        const record = await invoke(DOCUMENT, 'read', { businessKey: 'd-1' });
        expect((await invoke(DOCUMENT, 'update', { businessKey: 'd-1', revision: record.revision, value: { title: 'direct' } })).data.body.title).to.equal('direct');
    });
});

describe('state-permissions validation', function () {
    const invalid = [
        ...elements.filter(({ id }) => id !== `${DOCUMENT}-lifecycle`),
        { id: `${DOCUMENT}-lifecycle`, kind: 'slot-fill', data: { target: DOCUMENT, slot: 'traits', value: { trait: 'state', configuration: { ...lifecycle, permissionDimension: 'payment' } } } },
        ...grant('stray', [{ area: 'entities', resource: DOCUMENT, action: 'update', state: 'vanished' }, { area: 'entities', resource: DOCUMENT, action: 'read', state: 'draft' }])
    ];

    before(async () => boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements: invalid }));

    after(stop);

    it('reports a permission dimension that is no state dimension, and grants naming a state no entity type declares or on a read', () => {
        const problems = validate().map(problem => problem.message ?? problem);
        expect(problems.join('\n')).to.include('the permission dimension payment is no state dimension')
            .and.to.include('stray-actor: grants state vanished, which no entity type it grants declares')
            .and.to.include('stray-actor: grants state with the action read, which no read checks');
    });
});
