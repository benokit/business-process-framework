import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { explanationsOf } from '@business-framework/core/introspection';
import { headerPrincipal, ROLE_HEADER } from './principal.js';

const packages = ['http-server', 'security', 'authorization'].map(name => packageElements(`@business-framework/${name}`));

const documents = [
    { id: 'document-type', kind: 'kind', data: {} },
    { id: 'contract-type', kind: 'kind', data: { extends: 'document-type' } },
    { id: 'note', kind: 'document-type', data: {} },
    { id: 'offer', kind: 'contract-type', data: {} },
    { id: 'step', kind: 'schema', data: { '$data=1': ['approve', 'reject'] } },
    {
        id: 'document-store',
        kind: 'kind',
        data: {
            operations: {
                read: { input: { '!type': '@ref/document-type' }, implementation: { set: null } },
                act: { input: { '!type': '@ref/document-type', '!step': '@step' }, implementation: { set: null } }
            }
        }
    },
    { id: 'documents', kind: 'document-store', data: {} }
];

const endpoint = (id, method, operation, data) => ({
    id, kind: 'http-endpoint', data: { method, path: `/${id}`, target: { element: 'documents', operation }, ...data }
});

const readEndpoint = endpoint('read-document', 'GET', 'read', { operation: { area: 'documents', resource: '#.input.type', action: 'read' } });
const actEndpoint = endpoint('act-on-document', 'POST', 'act', { operation: { area: 'documents', resource: '#.input.type', action: '#.input.step' } });

const actor = (id, grants) => ({ id, kind: 'actor', data: { grants } });

const problemsWith = async (...elements) => {
    await boot({ paths: packages, elements: [...documents, readEndpoint, actEndpoint, ...elements] });
    return validate().flatMap(({ code, data }) => data.messages ?? [code]);
};

describe('authorization', () => {
    it('accepts grants of values, arrays, wildcards, kinds above the values and action levels', async () => {
        expect(await problemsWith(
            actor('clerk', [{ area: 'documents', resource: 'contract-type', action: ['approve', 'reject'] }, { area: 'documents', action: 'query' }]),
            actor('auditor', [{ area: '*', resource: 'document-type', action: 'read' }]),
            { id: 'back-office', kind: 'role', data: { actors: ['clerk', 'auditor'] } }
        )).to.deep.equal([]);
    });

    it('reports operations whose dimensions are missing, unknown, mistyped or not a closed set', async () => {
        expect(await problemsWith(
            endpoint('unbounded', 'GET', 'read', { operation: { area: 'documents', resource: '#.params.type', action: 'read' } }),
            endpoint('incomplete', 'GET', 'read', { operation: { area: 'documents', resource: '#.input.type', colour: 'red' } }),
            endpoint('misspelled', 'GET', 'read', { operation: { area: 'documents', resource: '#.input.typ', action: 'read' } })
        )).to.deep.equal([
            'unbounded: the resource is not a closed set of values',
            'incomplete: the operation names an unknown dimension colour',
            'incomplete: the operation names no action',
            "misspelled: 'typ' is not a property of the object (declared: type)",
            'misspelled: the resource is not a closed set of values'
        ]);
    });

    it('reports grants of values no endpoint performs, unknown dimensions and roles of unknown actors', async () => {
        expect(await problemsWith(
            actor('clerk', [{ area: 'documents', resource: ['offer', 'invoice'], action: ['approve', 'aprove'] }, { channel: 'web' }, { area: 'documents', except: [{ colour: 'red', resource: 'invoice' }] }]),
            { id: 'back-office', kind: 'role', data: { actors: ['clerk', 'nobody'], grants: [{ action: 'sign' }] } }
        )).to.deep.equal([
            'unknown-element',
            'clerk: grants resource invoice, which no endpoint performs',
            'clerk: grants action aprove, which no endpoint performs',
            'clerk: a grant names an unknown dimension channel',
            'clerk: a grant names an unknown dimension colour',
            'back-office: grants action sign, which no endpoint performs'
        ]);
    });

    it('reports a role that includes itself, and one including an unknown role', async () => {
        expect(await problemsWith(
            actor('clerk', [{ action: 'read' }]),
            { id: 'a-role', kind: 'role', data: { roles: ['b-role'] } },
            { id: 'b-role', kind: 'role', data: { roles: ['a-role', 'nobody'], actors: ['clerk'] } }
        )).to.deep.equal([
            'unknown-element',
            'a-role: includes itself through a-role > b-role > a-role',
            'b-role: includes itself through b-role > a-role > b-role'
        ]);
    });

    it('warns about an endpoint no actor grants', async () => {
        await boot({ paths: packages, elements: [...documents, readEndpoint, actEndpoint, actor('reader', [{ action: 'read' }])] });
        expect(validate({ warnings: true }).map(({ data }) => [data.severity, data.messages])).to.deep.equal([['warning', ['act-on-document: no actor grants its operation']]]);
    });

    it('explains which actors and roles may call an endpoint, and what an actor and a role reach', async () => {
        await boot({
            paths: packages,
            elements: [...documents, readEndpoint, actEndpoint,
                actor('clerk', [{ resource: 'contract-type', action: ['approve', 'reject'] }, { action: 'query' }]),
                { id: 'clerk-role', kind: 'role', data: { actors: ['clerk'] } },
                { id: 'office-role', kind: 'role', data: { roles: ['clerk-role'] } }]
        });
        expect(explanationsOf('act-on-document').authorization).to.deep.equal({
            operation: { area: ['documents'], resource: ['note', 'offer'], action: ['approve', 'reject'] },
            actors: { clerk: 'some' },
            roles: { 'clerk-role': 'some', 'office-role': 'some' }
        });
        expect([explanationsOf('clerk').authorization, explanationsOf('clerk-role').authorization]).to.deep.equal([
            { endpoints: { 'read-document': 'all', 'act-on-document': 'some' }, roles: ['clerk-role', 'office-role'] },
            { actors: ['clerk'], grants: [], roles: [], includedBy: ['office-role'], endpoints: { 'read-document': 'all', 'act-on-document': 'some' } }
        ]);
        expect(explanationsOf('documents')).to.deep.equal({});
    });

    it('takes a dimension added by a module, its default for endpoints that do not name it, and keeps grants without it', async () => {
        expect(await problemsWith(
            { id: 'channel-dimension', kind: 'slot-fill', data: { target: 'authorization', slot: 'dimensions', value: { name: 'channel', default: 'web' } } },
            endpoint('batch-read', 'GET', 'read', { operation: { area: 'documents', resource: '#.input.type', action: 'read', channel: 'batch' } }),
            actor('clerk', [{ area: 'documents', action: 'query' }, { channel: ['web', 'batch'] }])
        )).to.deep.equal([]);
    });
});

describe('authorization of requests', () => {
    const call = async (method, path, role, body) => {
        const { port } = await invoke('http-server', 'address', null);
        const response = await fetch(`http://localhost:${port}${path}`, {
            method,
            headers: { 'content-type': 'application/json', ...(role && { [ROLE_HEADER]: role }) },
            ...(body && { body: JSON.stringify(body) })
        });
        return response.status;
    };

    before(async () => {
        await boot({
            paths: packages,
            elements: [
                { kind: 'app-config', data: { http: { port: 0 } } },
                ...documents, ...headerPrincipal,
                endpoint('read-document', 'GET', 'read', { operation: { area: 'documents', resource: '#.input.type', action: 'read' }, request: { type: '#.query.type' } }),
                endpoint('act-on-document', 'POST', 'act', { operation: { area: 'documents', resource: '#.input.type', action: '#.input.step' } }),
                endpoint('ping', 'GET', 'read', { public: true, request: { type: 'note' } }),
                actor('clerk', [{ area: 'documents', resource: 'contract-type', action: ['approve', 'reject'] }, { area: 'documents', action: 'query' }]),
                actor('auditor', [{ area: '*', resource: 'document-type', action: 'read' }]),
                { id: 'clerk-role', kind: 'role', data: { actors: ['clerk'] } },
                { id: 'auditor-role', kind: 'role', data: { actors: ['auditor'] } },
                actor('note-keeper', [{ area: 'documents', except: [{ resource: 'contract-type' }, { resource: 'invoice' }] }]),
                { id: 'offer-approver-role', kind: 'role', data: { grants: [{ area: 'documents', resource: 'offer', action: 'approve' }] } },
                { id: 'office-role', kind: 'role', data: { roles: ['auditor-role', 'offer-approver-role'] } },
                { id: 'head-office-role', kind: 'role', data: { roles: ['office-role'], grants: [{ area: 'documents', resource: 'offer', action: 'reject' }] } },
                { id: 'note-keeper-role', kind: 'role', data: { actors: ['note-keeper'] } }
            ]
        });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('serves a public endpoint to anyone and refuses the others without a principal', async () => {
        expect([await call('GET', '/ping'), await call('GET', '/read-document?type=note')]).to.deep.equal([200, 401]);
    });

    it('permits an operation when one of the user\'s roles grants it, through arrays, kinds above the values and levels', async () => {
        expect(await Promise.all([
            call('POST', '/act-on-document', 'clerk-role', { type: 'offer', step: 'approve' }),
            call('POST', '/act-on-document', 'clerk-role', { type: 'note', step: 'approve' }),
            call('GET', '/read-document?type=note', 'clerk-role'),
            call('GET', '/read-document?type=note', 'auditor-role'),
            call('POST', '/act-on-document', 'auditor-role', { type: 'offer', step: 'reject' }),
            call('GET', '/read-document?type=note', 'nobody')
        ])).to.deep.equal([200, 403, 200, 200, 403, 403]);
    });

    it('permits a grant minus its exceptions, an exception of a value no endpoint performs excepting nothing', async () => {
        expect(await Promise.all([
            call('GET', '/read-document?type=note', 'note-keeper-role'),
            call('POST', '/act-on-document', 'note-keeper-role', { type: 'note', step: 'reject' }),
            call('GET', '/read-document?type=offer', 'note-keeper-role'),
            call('POST', '/act-on-document', 'note-keeper-role', { type: 'offer', step: 'approve' })
        ])).to.deep.equal([200, 200, 403, 403]);
    });

    it('permits what the roles a role includes permit, through any depth', async () => {
        expect(await Promise.all([
            call('GET', '/read-document?type=note', 'office-role'),
            call('POST', '/act-on-document', 'office-role', { type: 'offer', step: 'approve' }),
            call('POST', '/act-on-document', 'office-role', { type: 'offer', step: 'reject' }),
            call('GET', '/read-document?type=offer', 'head-office-role'),
            call('POST', '/act-on-document', 'head-office-role', { type: 'offer', step: 'approve' }),
            call('POST', '/act-on-document', 'head-office-role', { type: 'offer', step: 'reject' })
        ])).to.deep.equal([200, 200, 403, 200, 200, 200]);
    });

    it('permits what a role grants directly, beside its actors', async () => {
        expect(await Promise.all([
            call('POST', '/act-on-document', 'offer-approver-role', { type: 'offer', step: 'approve' }),
            call('POST', '/act-on-document', 'offer-approver-role', { type: 'offer', step: 'reject' })
        ])).to.deep.equal([200, 403]);
    });
});
