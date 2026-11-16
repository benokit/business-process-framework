import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const CONTRACT = `contract-${run}`;
const REVIEW = `review-${run}`;
const PROCESS = `issue-process-${run}`;
const PROCESSES = `issues-${run}`;
const TOUCHING = `touching-process-${run}`;
const TOUCHINGS = `touchings-${run}`;
const WAITING = `waiting-process-${run}`;
const WAITINGS = `waitings-${run}`;
const REFUSING = `refusing-process-${run}`;
const REFUSINGS = `refusings-${run}`;

const SIGNALLING = `signalling-process-${run}`;
const SIGNALLINGS = `signallings-${run}`;
const TIMED = `timed-process-${run}`;
const TIMEDS = `timeds-${run}`;

const roles = { contract: { entityType: CONTRACT } };

const eventually = async (check, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    expect(await check()).to.equal(true);
};

const readProcess = (entityType, businessKey) => invoke(entityType, 'read', { businessKey }).catch(() => null);

const wakeUp = (message, group) => invoke('process-wakeups', 'publish', { message, group: group ?? `${message.entityType}/${message.businessKey}` });

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const packages = ['integration', 'database', 'postgresql', 'transaction', 'transactional-outbox', 'transactional-outbox-postgresql', 'messaging', 'messaging-nats', 'security', 'entities', 'entities-postgresql', 'entity-states', 'entity-processes'];

const elements = [
    { id: CONTRACT, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!name': 'string' } } } } } },
    { id: REVIEW, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!outcome': 'string' } } } } } },
    {
        id: PROCESS,
        kind: 'process-definition',
        data: {
            entities: { contract: { entityType: CONTRACT }, review: { entityType: REVIEW, late: true } },
            start: 'finish',
            steps: { finish: { end: true } }
        }
    },
    { id: PROCESSES, kind: 'process-entity-type', data: { definition: PROCESS } },
    {
        id: TOUCHING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'begin',
            steps: {
                begin: {
                    do: { inputMap: { businessKey: '#.input.entities.contract.businessKey', revision: '#.input.entities.contract.revision', trait: 'body', operation: 'update', input: { value: { name: 'Touched' } } }, invoke: CONTRACT, operation: 'run' },
                    set: { count: 1 },
                    next: 'decide'
                },
                decide: { choose: [[{ $eq: ['#.process.data.body.count', 1] }, 'finish'], ['else', 'other']] },
                finish: { end: true },
                other: { end: true }
            }
        }
    },
    { id: TOUCHINGS, kind: 'process-entity-type', data: { definition: TOUCHING } },
    {
        id: WAITING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'hold',
            steps: { hold: { wait: { signals: { go: { to: 'done', by: 'contract' } }, until: { at: '2030-01-01', then: 'done' } } }, done: { end: true } }
        }
    },
    { id: WAITINGS, kind: 'process-entity-type', data: { definition: WAITING } },
    {
        id: REFUSING,
        kind: 'process-definition',
        data: { entities: roles, start: 'begin', steps: { begin: { do: { throw: { code: 'invalid', message: 'refused' } }, end: true } } }
    },
    { id: REFUSINGS, kind: 'process-entity-type', data: { definition: REFUSING } },
    {
        id: SIGNALLING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'hold',
            steps: {
                hold: { wait: { signals: { go: { to: 'done', by: 'contract' } }, until: { at: '2030-01-01', then: 'late' } } },
                done: { set: { by: '#.signal.by' }, end: true },
                late: { end: true }
            }
        }
    },
    { id: SIGNALLINGS, kind: 'process-entity-type', data: { definition: SIGNALLING } },
    {
        id: TIMED,
        kind: 'process-definition',
        data: { entities: roles, start: 'hold', steps: { hold: { wait: { until: { after: { minutes: 0 }, then: 'ring' } } }, ring: { set: { rang: true }, end: true } } }
    },
    { id: TIMEDS, kind: 'process-entity-type', data: { definition: TIMED } }
];

describe('processes', function () {
    this.timeout(15000);

    before(async function () {
        await skipWithoutPostgres(this);
        process.env.BPF__transactional_outbox__idleIntervalInMilliseconds = '100';
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
        await invoke(CONTRACT, 'create', { businessKey: 'c-1', traits: { body: { name: 'Ada' } } });
    });

    after(async () => {
        await stop();
        delete process.env.BPF__transactional_outbox__idleIntervalInMilliseconds;
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('creates a process entity at the start step with its bound roles and the status running', async () => {
        const created = await invoke(PROCESSES, 'create', { businessKey: 'p-1', traits: { process: { entities: { contract: 'c-1' } }, body: {} } });
        expect(created.data.process).to.deep.equal({ definition: PROCESS, step: 'finish', entities: { contract: { entityType: CONTRACT, businessKey: 'c-1' } } });
        expect(created.data.state).to.deep.equal({ status: 'running' });
    });

    it('runs the steps of a chain in one transaction: do, set, choose, and ends with the transition end', async () => {
        const ended = await invoke(TOUCHINGS, 'start', { businessKey: 'p-chain', entities: { contract: 'c-1' } });
        expect(ended.data.process.step).to.equal('finish');
        expect(ended.data.state).to.deep.equal({ status: 'ended' });
        expect(ended.data.body).to.deep.equal({ count: 1 });
        expect((await invoke(CONTRACT, 'read', { businessKey: 'c-1' })).data.body.name).to.equal('Touched');
    });

    it('stops at a wait and records it with the token, the signals and the date it waits for', async () => {
        const waiting = await invoke(WAITINGS, 'start', { businessKey: 'p-wait', entities: { contract: 'c-1' } });
        expect(waiting.data.process.step).to.equal('hold');
        expect(waiting.data.state).to.deep.equal({ status: 'running' });
        expect(waiting.data.process.wait).to.deep.equal({ token: waiting.revision, signals: ['go'], until: { then: 'done', at: '2030-01-01' } });
    });

    it('leaves nothing behind when a step fails: no process entity', async () => {
        const error = await invoke(REFUSINGS, 'start', { businessKey: 'p-refused', entities: { contract: 'c-1' } }).catch(failed => failed);
        expect([error.code, error.message]).to.deep.equal(['invalid', 'refused']);
        expect((await invoke(REFUSINGS, 'read', { businessKey: 'p-refused' }).catch(failed => failed)).code).to.equal('not-found');
    });

    it('wakes a waiting process with a signal, which the runner handles as the system, and ignores it once the process has ended', async () => {
        const waiting = await invoke(SIGNALLINGS, 'start', { businessKey: 'p-signal', entities: { contract: 'c-1' } });
        await wakeUp({ kind: 'signal', entityType: SIGNALLINGS, businessKey: 'p-signal', name: 'go', payload: { by: 'ada' } });
        await eventually(async () => (await readProcess(SIGNALLINGS, 'p-signal')).data.state.status === 'ended');
        const ended = await readProcess(SIGNALLINGS, 'p-signal');
        expect([ended.data.process.step, ended.data.body, ended.revision]).to.deep.equal(['done', { by: 'ada' }, waiting.revision + 1]);
        await wakeUp({ kind: 'signal', entityType: SIGNALLINGS, businessKey: 'p-signal', name: 'go', payload: { by: 'bob' } });
        await pause(400);
        expect((await readProcess(SIGNALLINGS, 'p-signal')).revision).to.equal(ended.revision);
    });

    it('drops a signal the wait does not list and a timer that is not the one of the wait', async () => {
        const waiting = await invoke(SIGNALLINGS, 'start', { businessKey: 'p-stale', entities: { contract: 'c-1' } });
        await wakeUp({ kind: 'signal', entityType: SIGNALLINGS, businessKey: 'p-stale', name: 'nobody-listens' });
        await wakeUp({ kind: 'timer', entityType: SIGNALLINGS, businessKey: 'p-stale', token: waiting.revision + 7, step: 'late' }, `${SIGNALLINGS}/p-stale/timer/other`);
        await pause(500);
        expect((await readProcess(SIGNALLINGS, 'p-stale')).revision).to.equal(waiting.revision);
    });

    it('wakes a process by the timer put with its wait, through the outbox, once the date is due', async () => {
        await invoke(TIMEDS, 'start', { businessKey: 'p-timer', entities: { contract: 'c-1' } });
        await eventually(async () => (await readProcess(TIMEDS, 'p-timer')).data.state.status === 'ended');
        const ended = await readProcess(TIMEDS, 'p-timer');
        expect([ended.data.process.step, ended.data.body]).to.deep.equal(['ring', { rang: true }]);
    });

    it('starts a process from a message, once however often the message is delivered', async () => {
        const start = { kind: 'start', entityType: TIMEDS, businessKey: 'p-message', entities: { contract: 'c-1' } };
        await wakeUp(start);
        await eventually(async () => (await readProcess(TIMEDS, 'p-message'))?.data.state.status === 'ended');
        const revision = (await readProcess(TIMEDS, 'p-message')).revision;
        await wakeUp(start);
        await pause(500);
        expect((await readProcess(TIMEDS, 'p-message')).revision).to.equal(revision);
    });

    it('refuses a start that leaves a role unbound, binds a late role or names a role the process lacks', async () => {
        const refusal = traits => invoke(PROCESSES, 'create', { businessKey: 'p-x', traits: { process: traits, body: {} } }).catch(error => error);
        expect((await refusal({ entities: {} })).message).to.include("the role 'contract' must be bound");
        expect((await refusal({ entities: { contract: 'c-1', stranger: 'x' } })).message).to.include("has no role 'stranger'");
        expect((await refusal({ entities: { contract: 'c-1', review: 'r-1' } })).message).to.include("the role 'review' is late");
    });
});
