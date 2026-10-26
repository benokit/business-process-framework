import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';

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
            actor('clerk', [{ area: 'documents', resource: ['offer', 'invoice'], action: ['approve', 'aprove'] }, { channel: 'web' }]),
            { id: 'back-office', kind: 'role', data: { actors: ['clerk', 'nobody'] } }
        )).to.deep.equal([
            'unknown-element',
            'clerk: grants resource invoice, which no endpoint performs',
            'clerk: grants action aprove, which no endpoint performs',
            'clerk: a grant names an unknown dimension channel'
        ]);
    });

    it('takes a dimension added by a module, its default for endpoints that do not name it, and keeps grants without it', async () => {
        expect(await problemsWith(
            { id: 'channel-dimension', kind: 'slot-fill', data: { target: 'authorization', slot: 'dimensions', value: { name: 'channel', default: 'web' } } },
            endpoint('batch-read', 'GET', 'read', { operation: { area: 'documents', resource: '#.input.type', action: 'read', channel: 'batch' } }),
            actor('clerk', [{ area: 'documents', action: 'query' }, { channel: ['web', 'batch'] }])
        )).to.deep.equal([]);
    });
});
