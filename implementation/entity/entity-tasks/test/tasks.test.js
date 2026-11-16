import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const REVIEW = `review-task-${run}`;

const elements = [
    {
        id: REVIEW,
        kind: 'entity-type',
        data: {
            traits: {
                task: {
                    configuration: {
                        actor: 'underwriter',
                        outcomes: { approved: { answer: true }, rejected: { answer: { '!reason': 'string' } }, 'timed-out': true }
                    }
                },
                body: { configuration: { schema: { note: 'string' } } }
            }
        }
    }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'security', 'entities', 'entities-postgresql', 'entity-tasks'];

const errorOf = promise => promise.then(() => null, error => error);

const user = userId => ({ user: Object.freeze({ userId, roles: [] }) });

const system = Object.freeze({ user: Object.freeze({ userId: 'system', roles: ['system'] }) });

const operate = (businessKey, revision, operation, input, ctx = {}) => invoke(REVIEW, 'run', { businessKey, revision, trait: 'task', operation, input }, ctx);

describe('entity-tasks', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    after(stop);

    const created = businessKey => invoke(REVIEW, 'create', { businessKey, traits: { task: { origin: { process: 'p-1', step: 'ask' }, about: [{ entityType: 'contract', businessKey: 'c-1' }], dueOn: '2030-01-01' }, body: {} } });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('creates an open task with the actor of its type, its origin, what it is about and its due date', async () => {
        const { data } = await created('t-1');
        expect(data.task).to.deep.equal({ status: 'open', actor: 'underwriter', origin: { process: 'p-1', step: 'ask' }, about: [{ entityType: 'contract', businessKey: 'c-1' }], dueOn: '2030-01-01' });
    });

    it('records what a user answered, with who said it, and replaces it while the task is open, closing nothing', async () => {
        const task = await created('t-2');
        const first = await operate('t-2', task.revision, 'answer', { outcome: 'approved' }, user('ada'));
        expect(first.data.task).to.deep.include({ status: 'open', answer: { outcome: 'approved', by: 'ada' } });
        const second = await operate('t-2', first.revision, 'answer', { outcome: 'rejected', result: { reason: 'too risky' } }, user('bo'));
        expect(second.data.task.answer).to.deep.equal({ outcome: 'rejected', result: { reason: 'too risky' }, by: 'bo' });
    });

    it('refuses an answer for an outcome only the process can reach, an unknown outcome and a result that breaks the schema', async () => {
        const task = await created('t-3');
        expect((await errorOf(operate('t-3', task.revision, 'answer', { outcome: 'timed-out' }, user('ada')))).code).to.equal('invalid');
        expect((await errorOf(operate('t-3', task.revision, 'answer', { outcome: 'nonsense' }, user('ada')))).code).to.equal('invalid');
        expect((await errorOf(operate('t-3', task.revision, 'answer', { outcome: 'rejected', result: { reason: 1 } }, user('ada')))).code).to.equal('invalid');
    });

    it('lets a user claim a task', async () => {
        const task = await created('t-4');
        expect((await operate('t-4', task.revision, 'claim', undefined, user('ada'))).data.task.assignedTo).to.equal('ada');
    });

    it('lets only the system close a task: a user is refused with private-operation', async () => {
        const task = await created('t-5');
        for (const operation of ['resolve', 'cancel']) {
            const error = await errorOf(operate('t-5', task.revision, operation, operation === 'resolve' ? { outcome: 'approved' } : undefined, user('ada')));
            expect([error.code, (await invoke(REVIEW, 'read', { businessKey: 't-5' })).data.task.status]).to.deep.equal(['private-operation', 'open']);
        }
    });

    it('resolves a task with an outcome the type declares, and refuses to resolve, answer or cancel a closed one', async () => {
        const task = await created('t-6');
        expect((await errorOf(operate('t-6', task.revision, 'resolve', { outcome: 'nonsense' }, system))).code).to.equal('invalid');
        const resolved = await operate('t-6', task.revision, 'resolve', { outcome: 'timed-out' }, system);
        expect(resolved.data.task).to.deep.include({ status: 'resolved', outcome: 'timed-out' });
        const codes = await Promise.all([operate('t-6', resolved.revision, 'answer', { outcome: 'approved' }, user('ada')), operate('t-6', resolved.revision, 'cancel', undefined, system), operate('t-6', resolved.revision, 'resolve', { outcome: 'approved' }, system)].map(errorOf));
        expect(codes.map(error => error.code)).to.deep.equal(['conflict', 'conflict', 'conflict']);
    });

    it('cancels an open task', async () => {
        const task = await created('t-7');
        expect((await operate('t-7', task.revision, 'cancel', undefined, system)).data.task.status).to.equal('cancelled');
    });
});
