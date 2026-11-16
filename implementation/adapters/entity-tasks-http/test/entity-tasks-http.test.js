import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';
import { headerPrincipal, ROLE_HEADER } from '../../../services/authorization/test/principal.js';

const run = Date.now();
const REVIEW = `review-tasks-http-${run}`;
const NOTE = `note-tasks-http-${run}`;

const elements = [
    { kind: 'app-config', data: { 'http-server': { port: 0 } } },
    { id: REVIEW, kind: 'entity-type', data: { traits: { task: { configuration: { outcomes: { approved: { answer: true }, rejected: { answer: { '!reason': 'string' } } } } } } } },
    { id: NOTE, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { text: 'string' } } } } } },
    { id: 'worker-role', kind: 'role', data: { actors: ['entity-task-worker-actor'] } },
    ...headerPrincipal
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-tasks', 'http-server', 'security', 'authorization', 'entities-http', 'entity-tasks-http'];

const post = async (path, body, headers = {}, role = 'worker-role') => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', [ROLE_HEADER]: role, ...headers }, body: JSON.stringify(body) });
    return { status: response.status, etag: response.headers.get('etag'), body: await response.json() };
};

describe('entity-tasks-http', function () {
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

    it('answers a task with ETags, and refuses a result that breaks the schema, a stale revision and an entity that is no task', async () => {
        await invoke(REVIEW, 'create', { businessKey: 't-1', traits: { task: {} } });
        const answer = (body, headers) => post(`/entities/${REVIEW}/t-1/task/answer`, body, headers);
        expect((await answer({ outcome: 'rejected', result: { reason: 1 } }, { 'if-match': '"1"' })).status).to.equal(400);
        expect((await answer({ outcome: 'approved' }, { 'if-match': '"7"' })).status).to.equal(409);
        const answered = await answer({ outcome: 'approved' }, { 'if-match': '"1"' });
        expect([answered.status, answered.etag, answered.body.data.task.answer.outcome, answered.body.data.task.status]).to.deep.equal([200, '"2"', 'approved', 'open']);
        await invoke(NOTE, 'create', { businessKey: 'n-1', traits: { body: { text: 'x' } } });
        expect((await post(`/entities/${NOTE}/n-1/task/answer`, { outcome: 'approved' }, { 'if-match': '"1"' })).status).to.equal(400);
    });

    it('refuses a principal whose role does not grant the area', async () => {
        await invoke(REVIEW, 'create', { businessKey: 't-2', traits: { task: {} } });
        expect((await post(`/entities/${REVIEW}/t-2/task/answer`, { outcome: 'approved' }, { 'if-match': '"1"' }, 'nobody-role')).status).to.equal(403);
    });
});
