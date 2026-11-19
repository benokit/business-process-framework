import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { getPool } from '@business-framework/postgresql';
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

const RECOVERING = `recovering-process-${run}`;
const RECOVERINGS = `recoverings-${run}`;
const STALING = `staling-process-${run}`;
const STALINGS = `stalings-${run}`;

const TIMEDLATER = `timedlaters-${run}`;
const TIMEDLATERDEF = `timedlater-process-${run}`;
const BREAKING = `breaking-process-${run}`;
const BREAKINGS = `breakings-${run}`;

const NOTICING = `noticing-process-${run}`;
const NOTICINGS = `noticings-${run}`;
const SURVEYING = `surveying-process-${run}`;
const SURVEYINGS = `surveyings-${run}`;

const SELFTOUCHING = `selftouching-process-${run}`;
const SELFTOUCHINGS = `selftouchings-${run}`;

const REVIEWTASK = `reviewtask-${run}`;
const ASKING = `asking-process-${run}`;
const ASKINGS = `askings-${run}`;

const ASKINGAGAIN = `askingagain-process-${run}`;
const ASKINGAGAINS = `askingagains-${run}`;
const REASKING = `reasking-process-${run}`;
const REASKINGS = `reaskings-${run}`;
const KEYED = `keyed-process-${run}`;
const KEYEDS = `keyeds-${run}`;

const PARTNER = `partner-events-${run}`;

const EXTENSIBLE = `extensible-process-${run}`;
const EXTENSIBLES = `extensibles-${run}`;

const BINDING = `binding-process-${run}`;
const BINDINGS = `bindings-${run}`;
const REBINDING = `rebinding-process-${run}`;
const REBINDINGS = `rebindings-${run}`;

const POLICY = `policy-${run}`;
const MOVING = `moving-process-${run}`;
const MOVINGS = `movings-${run}`;
const BLOCKED = `blocked-process-${run}`;
const BLOCKEDS = `blockeds-${run}`;

const OTHER = `other-${run}`;
const TRESPASSING = `trespassing-process-${run}`;
const TRESPASSINGS = `trespassings-${run}`;

const roles = { contract: { entityType: CONTRACT } };

const withReview = { contract: { entityType: CONTRACT }, review: { entityType: REVIEW, late: true } };

const failsFor = (name, code) => ({ if: { $eq: ['#.input.entities.contract.data.body.name', name] }, then: { throw: { code, message: `${name} fails` } } });

const halfDone = code => [
    { inputMap: { businessKey: '#.input.entities.contract.businessKey', revision: '#.input.entities.contract.revision', trait: 'body', operation: 'update', input: { value: { name: 'Half' } } }, invoke: CONTRACT, operation: 'run' },
    { throw: { code, message: 'no way' } }
];

const eventually = async (check, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    expect(await check()).to.equal(true);
};

const readProcess = (entityType, businessKey) => invoke(entityType, 'read', { businessKey }).catch(() => null);

const wakeUp = (message, group) => invoke('process-wakeups', 'publish', { message, group: group ?? `${message.entityType}/${message.businessKey}` });

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const packages = ['integration', 'database', 'postgresql', 'transaction', 'transactional-outbox', 'transactional-outbox-postgresql', 'messaging', 'messaging-nats', 'security', 'entities', 'entities-postgresql', 'entity-states', 'entity-events', 'entity-relations', 'entity-relations-postgresql', 'entity-tasks', 'entity-processes'];

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
    { id: TIMEDS, kind: 'process-entity-type', data: { definition: TIMED } },
    {
        id: RECOVERING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'begin',
            steps: {
                begin: { do: halfDone('state-refused'), onError: [{ catches: ['conflict'], set: { refusal: '#.error.message' }, then: 'report' }], next: 'finish' },
                report: { end: true },
                finish: { end: true }
            }
        }
    },
    { id: RECOVERINGS, kind: 'process-entity-type', data: { definition: RECOVERING } },
    {
        id: STALING,
        kind: 'process-definition',
        data: { entities: roles, start: 'begin', steps: { begin: { do: halfDone('stale'), onError: [{ catches: ['conflict'], then: 'report' }], next: 'report' }, report: { end: true } } }
    },
    { id: STALINGS, kind: 'process-entity-type', data: { definition: STALING } },
    {
        id: TIMEDLATERDEF,
        kind: 'process-definition',
        data: { entities: roles, start: 'hold', steps: { hold: { wait: { until: { at: '2030-01-01', then: 'ring' } } }, ring: { end: true } } }
    },
    { id: TIMEDLATER, kind: 'process-entity-type', data: { definition: TIMEDLATERDEF } },
    {
        id: BINDING,
        kind: 'process-definition',
        data: {
            entities: withReview,
            start: 'begin',
            steps: {
                begin: {
                    do: [{ inputMap: { businessKey: 'r-bound', traits: { body: { outcome: 'pending' } } }, invoke: REVIEW, operation: 'create' }, { return: { bind: { review: 'r-bound' } } }],
                    next: 'use'
                },
                use: { set: { outcome: '#.entities.review.data.body.outcome' }, end: true }
            }
        }
    },
    { id: BINDINGS, kind: 'process-entity-type', data: { definition: BINDING } },
    {
        id: REBINDING,
        kind: 'process-definition',
        data: { entities: withReview, start: 'begin', steps: { begin: { do: { return: { bind: { contract: 'c-1' } } }, end: true } } }
    },
    { id: REBINDINGS, kind: 'process-entity-type', data: { definition: REBINDING } },
    { id: OTHER, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { name: 'string' } } } } } },
    {
        id: TRESPASSING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'begin',
            steps: {
                begin: {
                    do: { if: { $eq: ['#.input.input.mode', 'update'] }, then: { inputMap: { businessKey: 'c-1', revision: '#.input.input.revision', trait: 'body', operation: 'update', input: { value: { name: 'Hijacked' } } }, invoke: CONTRACT, operation: 'run' }, else: { inputMap: { businessKey: 'o-1', traits: { body: { name: 'Stranger' } } }, invoke: OTHER, operation: 'create' } },
                    end: true
                }
            }
        }
    },
    { id: TRESPASSINGS, kind: 'process-entity-type', data: { definition: TRESPASSING } },
    {
        id: NOTICING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'hold',
            steps: {
                hold: { wait: { when: [{ test: { $eq: ['#.entities.contract.data.body.name', 'Ready'] }, then: 'done' }] } },
                done: { set: { name: '#.entities.contract.data.body.name' }, end: true }
            }
        }
    },
    { id: NOTICINGS, kind: 'process-entity-type', data: { definition: NOTICING } },
    {
        id: SURVEYING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'hold',
            steps: {
                hold: { wait: { when: [{ test: { $eq: [{ $get: { object: '#.entities', path: { $str: ['contract', '.data.body.name'] } } }, 'Ready'] }, then: 'done' }] } },
                done: { end: true }
            }
        }
    },
    { id: SURVEYINGS, kind: 'process-entity-type', data: { definition: SURVEYING } },
    {
        id: SELFTOUCHING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'touch',
            steps: {
                touch: { do: { inputMap: { businessKey: '#.input.entities.contract.businessKey', revision: '#.input.entities.contract.revision', trait: 'body', operation: 'update', input: { value: { name: 'Changed' } } }, invoke: CONTRACT, operation: 'run' }, next: 'hold' },
                hold: { wait: { when: [{ test: { $eq: ['#.entities.contract.data.body.name', 'Never'] }, then: 'done' }] } },
                done: { end: true }
            }
        }
    },
    { id: SELFTOUCHINGS, kind: 'process-entity-type', data: { definition: SELFTOUCHING } },
    { id: REVIEWTASK, kind: 'entity-type', data: { traits: { task: { configuration: { actor: 'underwriter', outcomes: { approved: { answer: true }, rejected: { answer: true } } } }, body: { configuration: { schema: { '*': '@any' } } } } } },
    {
        id: ASKING,
        kind: 'process-definition',
        data: {
            entities: { contract: { entityType: CONTRACT } },
            tasks: { review: { type: REVIEWTASK, about: ['contract'] } },
            start: 'ask',
            steps: {
                ask: {
                    open: { review: {} },
                    wait: {
                        when: [
                            { test: { $eq: ['#.tasks.review.data.task.answer.outcome', 'approved'] }, resolve: { review: 'approved' }, then: 'approved' },
                            { test: { $eq: ['#.tasks.review.data.task.answer.outcome', 'rejected'] }, resolve: { review: 'rejected' }, then: 'rejected' }
                        ],
                        signals: { withdraw: { to: 'withdrawn', by: 'contract' } }
                    }
                },
                approved: { set: { decision: 'approved' }, end: true },
                rejected: { set: { decision: 'rejected' }, end: true },
                withdrawn: { set: { decision: 'withdrawn' }, end: true }
            }
        }
    },
    { id: ASKINGS, kind: 'process-entity-type', data: { definition: ASKING } },
    {
        id: ASKINGAGAIN,
        kind: 'process-definition',
        data: {
            entities: { contract: { entityType: CONTRACT } },
            tasks: { review: { type: REVIEWTASK, about: ['contract'] } },
            variables: { sawTask: 'boolean' },
            start: 'ask',
            steps: {
                ask: { open: { review: { body: { note: '#.entities.contract.data.body.name' }, dueOn: '#.input.due', assignTo: '#.input.assignee' } }, next: 'again' },
                again: { open: { review: {} }, do: { set: { saw: '#.input.tasks.review.data.task.status' } }, set: { sawTask: { $eq: ['#.tasks.review.data.task.status', 'open'] } }, wait: { signals: { go: { to: 'done', by: 'contract' } } } },
                done: { end: true }
            }
        }
    },
    { id: ASKINGAGAINS, kind: 'process-entity-type', data: { definition: ASKINGAGAIN } },
    {
        id: REASKING,
        kind: 'process-definition',
        data: {
            entities: { contract: { entityType: CONTRACT } },
            tasks: { review: { type: REVIEWTASK, about: ['contract'] } },
            start: 'first',
            steps: {
                first: {
                    open: { review: {} },
                    wait: { when: [{ test: { $eq: ['#.tasks.review.data.task.answer.outcome', 'approved'] }, resolve: { review: 'approved' }, then: 'second' }, { test: { $eq: ['#.tasks.review.data.task.answer.outcome', 'rejected'] }, resolve: { review: 'rejected' }, then: 'second' }] }
                },
                second: { open: { review: {} }, end: true }
            }
        }
    },
    { id: REASKINGS, kind: 'process-entity-type', data: { definition: REASKING } },
    { id: KEYED, kind: 'process-definition', data: { entities: roles, key: ['#.input.year'], start: 'finish', steps: { finish: { end: true } } } },
    { id: KEYEDS, kind: 'process-entity-type', data: { definition: KEYED } },
    { id: PARTNER, kind: 'message-channel', data: { broker: { instanceOf: 'message-broker' }, topology: 'topic', name: PARTNER, publisher: { transactionalOutbox: true } } },
    {
        id: `partner-start-trigger-${run}`,
        kind: 'process-trigger',
        data: {
            on: { channel: PARTNER, test: { $eq: ['#.type', 'contract-issued'] } },
            start: { process: SIGNALLINGS, entities: { contract: '#.contractKey' } }
        }
    },
    {
        id: `partner-reply-trigger-${run}`,
        kind: 'process-trigger',
        data: {
            on: { channel: PARTNER, subject: 'replies' },
            signal: { process: SIGNALLINGS, name: 'go', entity: { entityType: CONTRACT, businessKey: '#.contractKey' }, payload: { by: '#.by' } }
        }
    },
    { id: EXTENSIBLE, kind: 'process-definition', data: { entities: roles, start: 'work', steps: { work: { extensible: true, set: { done: true }, end: true } } } },
    { id: EXTENSIBLES, kind: 'process-entity-type', data: { definition: EXTENSIBLE } },
    {
        id: `compliance-check-${run}`,
        kind: 'slot-fill',
        data: {
            target: EXTENSIBLE,
            slot: 'stepExtensions',
            value: { step: 'work', do: { if: { $eq: ['#.input.entities.contract.data.body.name', 'Forbidden'] }, then: { throw: { code: 'invalid', message: 'compliance refuses' } } } }
        }
    },
    { id: `flaky-error-${run}`, kind: 'slot-fill', data: { target: 'error-registry', slot: 'errorTypes', value: { code: 'flaky-for-test', transient: true } } },
    {
        id: BREAKING,
        kind: 'process-definition',
        data: {
            entities: roles,
            start: 'hold',
            steps: {
                hold: { wait: { signals: { go: { to: 'work', by: 'contract' } } } },
                work: { do: [failsFor('Failing', 'flaky-for-test'), failsFor('Refusing', 'invalid'), failsFor('Down', 'unavailable')], end: true }
            }
        }
    },
    { id: BREAKINGS, kind: 'process-entity-type', data: { definition: BREAKING } },
    {
        id: POLICY,
        kind: 'entity-type',
        data: {
            traits: {
                body: { configuration: { schema: { '!name': 'string' } } },
                state: {
                    configuration: {
                        states: { status: { draft: true, issued: true, discarded: true } },
                        transitions: { issue: { status: { draft: 'issued' } }, discard: { status: { draft: 'discarded' } } },
                        initialStates: { default: { status: 'draft' } }
                    }
                }
            }
        }
    },
    {
        id: MOVING,
        kind: 'process-definition',
        data: {
            entities: { policy: { entityType: POLICY } },
            start: 'begin',
            steps: { begin: { do: { inputMap: { businessKey: '#.input.entities.policy.businessKey', revision: '#.input.entities.policy.revision', trait: 'body', operation: 'update', input: { value: { name: 'Edited first' } } }, invoke: POLICY, operation: 'run' }, transition: { policy: 'issue' }, end: true } }
        }
    },
    { id: MOVINGS, kind: 'process-entity-type', data: { definition: MOVING } },
    {
        id: BLOCKED,
        kind: 'process-definition',
        data: {
            entities: { policy: { entityType: POLICY } },
            variables: { failure: 'string' },
            start: 'begin',
            steps: {
                begin: { transition: { policy: 'discard' }, onError: [{ catches: ['state-refused'], set: { failure: '#.error.message' }, then: 'refused' }], end: true },
                refused: { end: true }
            }
        }
    },
    { id: BLOCKEDS, kind: 'process-entity-type', data: { definition: BLOCKED } }
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
        await invoke(CONTRACT, 'create', { businessKey: 'c-2', traits: { body: { name: 'Original' } } });
        await invoke(CONTRACT, 'create', { businessKey: 'c-3', traits: { body: { name: 'Original' } } });
        await Promise.all(['pol-1', 'pol-2'].map(businessKey => invoke(POLICY, 'create', { businessKey, traits: { body: { name: 'Draft' } } })));
        await Promise.all([['c-4', 'Failing'], ['c-5', 'Refusing'], ['c-6', 'Down']].map(([businessKey, name]) => invoke(CONTRACT, 'create', { businessKey, traits: { body: { name } } })));
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

    it('moves a participant with the transition of a step, from the revision the step left it at', async () => {
        const ended = await invoke(MOVINGS, 'start', { businessKey: 'p-move', entities: { policy: 'pol-1' } });
        expect(ended.data.state).to.deep.equal({ status: 'ended' });
        const policy = await invoke(POLICY, 'read', { businessKey: 'pol-1' });
        expect([policy.data.body.name, policy.data.state]).to.deep.equal(['Edited first', { status: 'issued' }]);
    });

    it('hands a refused transition to the onError exits of the step', async () => {
        await invoke(POLICY, 'run', { businessKey: 'pol-2', revision: 1, trait: 'state', operation: 'transition', input: { transition: 'issue' } });
        const ended = await invoke(BLOCKEDS, 'start', { businessKey: 'p-blocked', entities: { policy: 'pol-2' } });
        expect([ended.data.process.step, ended.data.body.failure]).to.deep.equal(['refused', "transition discard isn't allowed from the current state"]);
        expect((await invoke(POLICY, 'read', { businessKey: 'pol-2' })).data.state).to.deep.equal({ status: 'issued' });
    });

    it('stops at a wait and records it with the token, the signals and the date it waits for', async () => {
        const waiting = await invoke(WAITINGS, 'start', { businessKey: 'p-wait', entities: { contract: 'c-1' } });
        expect(waiting.data.process.step).to.equal('hold');
        expect(waiting.data.state).to.deep.equal({ status: 'running' });
        expect(waiting.data.process.wait).to.deep.equal({ token: waiting.revision, signals: ['go'], until: { then: 'done', at: '2030-01-01' } });
    });

    it('takes the onError exit of a step that fails for good, with the work of the step rolled back whole and the error read by the entry', async () => {
        const recovered = await invoke(RECOVERINGS, 'start', { businessKey: 'p-recovered', entities: { contract: 'c-2' } });
        expect([recovered.data.process.step, recovered.data.state, recovered.data.body]).to.deep.equal(['report', { status: 'ended' }, { refusal: 'no way' }]);
        expect((await invoke(CONTRACT, 'read', { businessKey: 'c-2' })).data.body.name).to.equal('Original');
    });

    it('does not catch a transient error, whatever the entry says: it fails the start and leaves nothing', async () => {
        const error = await invoke(STALINGS, 'start', { businessKey: 'p-stale-step', entities: { contract: 'c-3' } }).catch(failed => failed);
        expect(error.code).to.equal('stale');
        expect((await readProcess(STALINGS, 'p-stale-step'))).to.equal(null);
        expect((await invoke(CONTRACT, 'read', { businessKey: 'c-3' })).data.body.name).to.equal('Original');
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

    describe('the derived business key', () => {
        const startOf = (entityType, extra) => ({ kind: 'start', entityType, entities: { contract: 'c-1' }, ...extra });

        it('is the definition and the keys of the roles bound at the start, so a second start for the same participants finds the key taken and is dropped', async () => {
            await wakeUp(startOf(TIMEDS), `${TIMEDS}/derived`);
            await eventually(async () => (await readProcess(TIMEDS, `${TIMED}/c-1`))?.data.state.status === 'ended');
            const revision = (await readProcess(TIMEDS, `${TIMED}/c-1`)).revision;
            await wakeUp(startOf(TIMEDS), `${TIMEDS}/derived`);
            await pause(500);
            expect((await readProcess(TIMEDS, `${TIMED}/c-1`)).revision).to.equal(revision);
        });

        it('adds what the definition says distinguishes the runs, so a renewal may run again for the same participants', async () => {
            await wakeUp(startOf(KEYEDS, { input: { year: '2027' } }), `${KEYEDS}/a`);
            await wakeUp(startOf(KEYEDS, { input: { year: '2028' } }), `${KEYEDS}/b`);
            await eventually(async () => (await readProcess(KEYEDS, `${KEYED}/c-1/2027`)) !== null && (await readProcess(KEYEDS, `${KEYED}/c-1/2028`)) !== null);
        });
    });

    describe('extensions of a step', () => {
        it('runs what another module filled into an extensible step, in the step and its transaction: a refusal fails the step', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-ext-1', traits: { body: { name: 'Fine' } } });
            await invoke(CONTRACT, 'create', { businessKey: 'c-ext-2', traits: { body: { name: 'Forbidden' } } });
            const ended = await invoke(EXTENSIBLES, 'start', { businessKey: 'p-ext-1', entities: { contract: 'c-ext-1' } });
            expect(ended.data.state.status).to.equal('ended');
            const error = await invoke(EXTENSIBLES, 'start', { businessKey: 'p-ext-2', entities: { contract: 'c-ext-2' } }).catch(failed => failed);
            expect([error.code, error.message, await readProcess(EXTENSIBLES, 'p-ext-2')]).to.deep.equal(['invalid', 'compliance refuses', null]);
        });
    });

    describe('triggers', () => {
        const say = (message, subject) => invoke(PARTNER, 'publish', { message, subject, group: 'partner' });

        const processOf = key => readProcess(SIGNALLINGS, `${SIGNALLING}/${key}`);

        it('starts a process from a message that its test accepts, once however often the message comes, and ignores one it does not', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-trig', traits: { body: { name: 'Trig' } } });
            await say({ type: 'something-else', contractKey: 'c-trig' });
            await say({ type: 'contract-issued', contractKey: 'c-trig' });
            await eventually(async () => (await processOf('c-trig'))?.data.state.status === 'running');
            const revision = (await processOf('c-trig')).revision;
            await say({ type: 'contract-issued', contractKey: 'c-trig' });
            await pause(600);
            expect((await processOf('c-trig')).revision).to.equal(revision);
        });

        it('signals the processes that hold the entity the message is about, with the payload the trigger maps', async () => {
            await say({ contractKey: 'c-trig', by: 'ada' }, 'replies');
            await eventually(async () => (await processOf('c-trig')).data.state.status === 'ended');
            expect((await processOf('c-trig')).data.body).to.deep.equal({ by: 'ada' });
        });

        it('leaves a process that does not hold the entity alone', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-trig-2', traits: { body: { name: 'Trig' } } });
            await say({ contractKey: 'c-trig-2', by: 'bob' }, 'replies');
            await pause(600);
            expect(await processOf('c-trig-2')).to.equal(null);
        });
    });

    it('suspends a process whose stored step the loaded definition no longer has, with the fault unknown-definition', async () => {
        await invoke(WAITINGS, 'start', { businessKey: 'p-renamed', entities: { contract: 'c-1' } });
        await getPool().query("UPDATE entities SET data = jsonb_set(data, '{process,step}', '\"gone\"') WHERE entity_type = $1 AND business_key = $2", [WAITINGS, 'p-renamed']);
        await invoke(WAITINGS, 'wake', { kind: 'signal', entityType: WAITINGS, businessKey: 'p-renamed', name: 'go' }).catch(() => null);
        const suspended = await readProcess(WAITINGS, 'p-renamed');
        expect([suspended.data.state.status, suspended.data.process.fault.code]).to.deep.equal(['suspended', 'unknown-definition']);
    });

    describe('the circuit breaker', () => {
        const GO = businessKey => ({ kind: 'signal', entityType: BREAKINGS, businessKey, name: 'go' });

        it('suspends a process at once when a step fails for good, keeping the wake-up that was being handled, and acknowledges it', async () => {
            await invoke(BREAKINGS, 'start', { businessKey: 'p-refusing', entities: { contract: 'c-5' } });
            await invoke(BREAKINGS, 'wake', GO('p-refusing'));
            const suspended = await readProcess(BREAKINGS, 'p-refusing');
            expect(suspended.data.state).to.deep.equal({ status: 'suspended' });
            expect(suspended.data.process.step).to.equal('hold');
            expect(suspended.data.process.fault).to.deep.equal({ step: 'work', code: 'invalid', message: 'Refusing fails', attempts: 1, wakeup: GO('p-refusing') });
        });

        it('retries a transient failure, counting consecutive failures of the step, and suspends after the limit', async () => {
            await invoke(BREAKINGS, 'start', { businessKey: 'p-failing', entities: { contract: 'c-4' } });
            const failures = [];
            for (const attempt of [1, 2]) {
                const error = await invoke(BREAKINGS, 'wake', GO('p-failing')).catch(failed => failed);
                failures.push([error.code, (await readProcess(BREAKINGS, 'p-failing')).data.process.failures]);
                expect(attempt).to.be.lessThan(3);
            }
            expect(failures).to.deep.equal([['flaky-for-test', { step: 'work', count: 1 }], ['flaky-for-test', { step: 'work', count: 2 }]]);
            expect(await invoke(BREAKINGS, 'wake', GO('p-failing'))).to.equal(null);
            const suspended = await readProcess(BREAKINGS, 'p-failing');
            expect([suspended.data.state.status, suspended.data.process.fault.attempts, suspended.data.process.fault.code]).to.deep.equal(['suspended', 3, 'flaky-for-test']);
        });

        it('forgets the failures once the step succeeds', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-7', traits: { body: { name: 'Failing' } } });
            await invoke(BREAKINGS, 'start', { businessKey: 'p-recovering', entities: { contract: 'c-7' } });
            await invoke(BREAKINGS, 'wake', GO('p-recovering')).catch(() => null);
            expect((await readProcess(BREAKINGS, 'p-recovering')).data.process.failures).to.deep.equal({ step: 'work', count: 1 });
            const contract = await invoke(CONTRACT, 'read', { businessKey: 'c-7' });
            await invoke(CONTRACT, 'run', { businessKey: 'c-7', revision: contract.revision, trait: 'body', operation: 'update', input: { value: { name: 'Fine' } } });
            await invoke(BREAKINGS, 'wake', GO('p-recovering'));
            const ended = await readProcess(BREAKINGS, 'p-recovering');
            expect([ended.data.state.status, ended.data.process.failures]).to.deep.equal(['ended', undefined]);
        });

        const transition = async (businessKey, name) => {
            const record = await readProcess(BREAKINGS, businessKey);
            return invoke(BREAKINGS, 'run', { businessKey, revision: record.revision, trait: 'state', operation: 'transition', input: { transition: name } });
        };

        it('replays the wake-up that caused the fault when an operator resumes the process, and clears the fault', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-8', traits: { body: { name: 'Refusing' } } });
            await invoke(BREAKINGS, 'start', { businessKey: 'p-resumed', entities: { contract: 'c-8' } });
            await invoke(BREAKINGS, 'wake', GO('p-resumed'));
            expect((await readProcess(BREAKINGS, 'p-resumed')).data.state.status).to.equal('suspended');
            const contract = await invoke(CONTRACT, 'read', { businessKey: 'c-8' });
            await invoke(CONTRACT, 'run', { businessKey: 'c-8', revision: contract.revision, trait: 'body', operation: 'update', input: { value: { name: 'Fine' } } });
            await transition('p-resumed', 'resume');
            await eventually(async () => (await readProcess(BREAKINGS, 'p-resumed')).data.state.status === 'ended');
            const ended = await readProcess(BREAKINGS, 'p-resumed');
            expect([ended.data.process.step, ended.data.process.fault]).to.deep.equal(['work', undefined]);
        });

        it('clears the fault when an operator aborts the process, and replays nothing', async () => {
            await invoke(BREAKINGS, 'start', { businessKey: 'p-aborted', entities: { contract: 'c-5' } });
            await invoke(BREAKINGS, 'wake', GO('p-aborted'));
            await transition('p-aborted', 'abort');
            const aborted = await readProcess(BREAKINGS, 'p-aborted');
            expect([aborted.data.state.status, aborted.data.process.fault]).to.deep.equal(['aborted', undefined]);
        });

        it('puts the timer of the wait again when an operator resumes the process, for a date that may have passed while it was suspended', async () => {
            await invoke(TIMEDLATER, 'start', { businessKey: 'p-rearmed', entities: { contract: 'c-1' } });
            const timers = async () => (await getPool().query('SELECT count(*)::int AS count FROM transactional_outbox WHERE message_group LIKE $1 AND status = 0', [`${TIMEDLATER}/p-rearmed/timer/%`])).rows[0].count;
            expect(await timers()).to.equal(1);
            const suspended = await invoke(TIMEDLATER, 'run', { businessKey: 'p-rearmed', revision: (await invoke(TIMEDLATER, 'read', { businessKey: 'p-rearmed' })).revision, trait: 'state', operation: 'transition', input: { transition: 'suspend' } });
            expect(suspended.data.state.status).to.equal('suspended');
            await invoke(TIMEDLATER, 'run', { businessKey: 'p-rearmed', revision: suspended.revision, trait: 'state', operation: 'transition', input: { transition: 'resume' } });
            expect(await timers()).to.equal(2);
        });

        it('does not count an outage: the process stays as it was and the error goes on', async () => {
            await invoke(BREAKINGS, 'start', { businessKey: 'p-down', entities: { contract: 'c-6' } });
            const before = await readProcess(BREAKINGS, 'p-down');
            expect((await invoke(BREAKINGS, 'wake', GO('p-down')).catch(failed => failed)).code).to.equal('unavailable');
            expect((await readProcess(BREAKINGS, 'p-down')).revision).to.equal(before.revision);
        });
    });

    describe('a wait on a fact', () => {
        const CHECK = businessKey => ({ kind: 'check', entityType: NOTICINGS, businessKey });

        it('goes on at once when the fact already holds as the wait begins', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-ready', traits: { body: { name: 'Ready' } } });
            const ended = await invoke(NOTICINGS, 'start', { businessKey: 'p-ready', entities: { contract: 'c-ready' } });
            expect([ended.data.process.step, ended.data.state.status, ended.data.body]).to.deep.equal(['done', 'ended', { name: 'Ready' }]);
        });

        it('waits while the fact does not hold, and a check on the current data takes the step once it does', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-notice', traits: { body: { name: 'Draft' } } });
            const waiting = await invoke(NOTICINGS, 'start', { businessKey: 'p-notice', entities: { contract: 'c-notice' } });
            expect(waiting.data.process.step).to.equal('hold');
            await invoke(NOTICINGS, 'wake', CHECK('p-notice'));
            expect((await readProcess(NOTICINGS, 'p-notice')).revision).to.equal(waiting.revision);
            const contract = await invoke(CONTRACT, 'read', { businessKey: 'c-notice' });
            await invoke(CONTRACT, 'run', { businessKey: 'c-notice', revision: contract.revision, trait: 'body', operation: 'update', input: { value: { name: 'Ready' } } });
            await invoke(NOTICINGS, 'wake', CHECK('p-notice'));
            const ended = await readProcess(NOTICINGS, 'p-notice');
            expect([ended.data.process.step, ended.data.state.status, ended.data.body, ended.data.process.wait]).to.deep.equal(['done', 'ended', { name: 'Ready' }, undefined]);
        });

        const update = async (businessKey, name) => {
            const { revision } = await invoke(CONTRACT, 'read', { businessKey });
            return invoke(CONTRACT, 'run', { businessKey, revision, trait: 'body', operation: 'update', input: { value: { name } } });
        };

        const viewChanges = async businessKey => (await getPool().query('SELECT count(*)::int AS count FROM transactional_outbox WHERE channel = $1 AND message_group = $2', ['entity-view-changes', `${CONTRACT}/${businessKey}`])).rows[0].count;

        it('is woken by a change of what its tests read: the publisher puts the change, the watcher a check for each process holding the entity', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-watched', traits: { body: { name: 'Draft' } } });
            await invoke(NOTICINGS, 'start', { businessKey: 'p-watched', entities: { contract: 'c-watched' } });
            await update('c-watched', 'Ready');
            await eventually(async () => (await readProcess(NOTICINGS, 'p-watched')).data.state.status === 'ended');
            expect((await readProcess(NOTICINGS, 'p-watched')).data.body).to.deep.equal({ name: 'Ready' });
        });

        it('is woken by a change of an entity a test reads through a computed path, which names no role or field', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-computed', traits: { body: { name: 'Draft' } } });
            await invoke(SURVEYINGS, 'start', { businessKey: 'p-computed', entities: { contract: 'c-computed' } });
            await update('c-computed', 'Ready');
            await eventually(async () => (await readProcess(SURVEYINGS, 'p-computed')).data.state.status === 'ended');
        });

        it('publishes nothing for a write that changes no view, and nothing for an entity type no process reads', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-quiet', traits: { body: { name: 'Draft' } } });
            await invoke(NOTICINGS, 'start', { businessKey: 'p-quiet', entities: { contract: 'c-quiet' } });
            expect(await viewChanges('c-quiet')).to.equal(1);
            await update('c-quiet', 'Draft');
            expect(await viewChanges('c-quiet')).to.equal(1);
            await invoke(OTHER, 'create', { businessKey: 'o-quiet', traits: { body: { name: 'x' } } });
            expect((await getPool().query('SELECT count(*)::int AS count FROM transactional_outbox WHERE channel = $1 AND message_group = $2', ['entity-view-changes', `${OTHER}/o-quiet`])).rows[0].count).to.equal(0);
        });

        it('does not check the process whose own step made the change, and checks the others that hold the entity', async () => {
            await invoke(CONTRACT, 'create', { businessKey: 'c-self', traits: { body: { name: 'Draft' } } });
            await invoke(NOTICINGS, 'start', { businessKey: 'p-control', entities: { contract: 'c-self' } });
            await invoke(SELFTOUCHINGS, 'start', { businessKey: 'p-self', entities: { contract: 'c-self' } });
            const checks = async (entityType, businessKey) => (await getPool().query("SELECT count(*)::int AS count FROM transactional_outbox WHERE channel = 'process-wakeups' AND message_group = $1 AND envelope->'message'->>'kind' = 'check'", [`${entityType}/${businessKey}`])).rows[0].count;
            await eventually(async () => await checks(NOTICINGS, 'p-control') === 1);
            expect(await checks(SELFTOUCHINGS, 'p-self')).to.equal(0);
        });

        it('drops a check for a process that is not waiting any more', async () => {
            const ended = await readProcess(NOTICINGS, 'p-ready');
            await invoke(NOTICINGS, 'wake', CHECK('p-ready'));
            expect((await readProcess(NOTICINGS, 'p-ready')).revision).to.equal(ended.revision);
        });
    });

    describe('tasks', () => {
        const taskOf = businessKey => invoke(REVIEWTASK, 'read', { businessKey });

        const contractFor = async businessKey => invoke(CONTRACT, 'create', { businessKey, traits: { body: { name: 'Task' } } });

        const answer = async (businessKey, outcome) => invoke(REVIEWTASK, 'run', { businessKey, revision: (await taskOf(businessKey)).revision, trait: 'task', operation: 'answer', input: { outcome } }, { user: Object.freeze({ userId: 'ada', roles: [] }) });

        it('creates the task in the step that asks, and the process closes it with the outcome when the fact holds', async () => {
            await contractFor('c-ask-1');
            const waiting = await invoke(ASKINGS, 'start', { businessKey: 'p-ask-1', entities: { contract: 'c-ask-1' } });
            expect([waiting.data.process.step, (await taskOf('p-ask-1.review')).data.task.status]).to.deep.equal(['ask', 'open']);
            await answer('p-ask-1.review', 'approved');
            await eventually(async () => (await readProcess(ASKINGS, 'p-ask-1')).data.state.status === 'ended');
            expect((await readProcess(ASKINGS, 'p-ask-1')).data.body).to.deep.equal({ decision: 'approved' });
            expect((await taskOf('p-ask-1.review')).data.task).to.deep.include({ status: 'resolved', outcome: 'approved' });
        });

        it('routes another answer to another outcome', async () => {
            await contractFor('c-ask-2');
            await invoke(ASKINGS, 'start', { businessKey: 'p-ask-2', entities: { contract: 'c-ask-2' } });
            await answer('p-ask-2.review', 'rejected');
            await eventually(async () => (await readProcess(ASKINGS, 'p-ask-2')).data.state.status === 'ended');
            expect([(await readProcess(ASKINGS, 'p-ask-2')).data.body, (await taskOf('p-ask-2.review')).data.task.outcome]).to.deep.equal([{ decision: 'rejected' }, 'rejected']);
        });

        it('cancels the open task when the process leaves the wait by another way', async () => {
            await contractFor('c-ask-3');
            await invoke(ASKINGS, 'start', { businessKey: 'p-ask-3', entities: { contract: 'c-ask-3' } });
            await invoke(ASKINGS, 'wake', { kind: 'signal', entityType: ASKINGS, businessKey: 'p-ask-3', name: 'withdraw' });
            expect([(await readProcess(ASKINGS, 'p-ask-3')).data.body, (await taskOf('p-ask-3.review')).data.task.status]).to.deep.equal([{ decision: 'withdrawn' }, 'cancelled']);
            expect((await answer('p-ask-3.review', 'approved').catch(failed => failed)).code).to.equal('conflict');
        });

        it('cancels the open task when an operator aborts the process', async () => {
            await contractFor('c-ask-4');
            const waiting = await invoke(ASKINGS, 'start', { businessKey: 'p-ask-4', entities: { contract: 'c-ask-4' } });
            await invoke(ASKINGS, 'run', { businessKey: 'p-ask-4', revision: waiting.revision, trait: 'state', operation: 'transition', input: { transition: 'abort' } });
            expect([(await readProcess(ASKINGS, 'p-ask-4')).data.state.status, (await taskOf('p-ask-4.review')).data.task.status]).to.deep.equal(['aborted', 'cancelled']);
        });

        it('opens a task from the declaration: its key, what it is about, where it came from, its due date and its assignee; a second opening while it is open changes nothing', async () => {
            await contractFor('c-open-1');
            await invoke(ASKINGAGAINS, 'start', { businessKey: 'p-open-1', entities: { contract: 'c-open-1' }, input: { due: '2030-05-01', assignee: 'ada' } });
            const task = await taskOf('p-open-1.review');
            expect(task.data.task).to.deep.include({ status: 'open', origin: { process: 'p-open-1', step: 'ask' }, about: [{ entityType: CONTRACT, businessKey: 'c-open-1' }], dueOn: '2030-05-01', assignedTo: 'ada' });
            expect([task.revision, task.data.body]).to.deep.equal([1, { note: 'Task' }]);
            expect((await readProcess(ASKINGAGAINS, 'p-open-1')).data.body).to.deep.equal({ sawTask: true });
        });

        it('refuses to open a task again once it is resolved: the process is suspended with the conflict and the chain, the resolving included, is rolled back', async () => {
            await contractFor('c-open-2');
            await invoke(REASKINGS, 'start', { businessKey: 'p-open-2', entities: { contract: 'c-open-2' } });
            await answer('p-open-2.review', 'approved');
            await eventually(async () => (await readProcess(REASKINGS, 'p-open-2')).data.state.status === 'suspended');
            const record = await readProcess(REASKINGS, 'p-open-2');
            expect([record.data.process.fault.code, (await taskOf('p-open-2.review')).data.task.status]).to.deep.equal(['conflict', 'open']);
        });

        it('takes the step at once when the fact already holds as the wait begins, and a user cannot close the task directly', async () => {
            await contractFor('c-ask-5');
            await invoke(ASKINGS, 'start', { businessKey: 'p-ask-5', entities: { contract: 'c-ask-5' } });
            const task = await taskOf('p-ask-5.review');
            const error = await invoke(REVIEWTASK, 'run', { businessKey: 'p-ask-5.review', revision: task.revision, trait: 'task', operation: 'resolve', input: { outcome: 'approved' } }, { user: Object.freeze({ userId: 'ada', roles: [] }) }).catch(failed => failed);
            expect([error.code, (await taskOf('p-ask-5.review')).data.task.status]).to.deep.equal(['private-operation', 'open']);
        });
    });

    it('binds a late role to the entity a step created, which the steps after it read, and records the binding', async () => {
        const ended = await invoke(BINDINGS, 'start', { businessKey: 'p-bound', entities: { contract: 'c-1' } });
        expect(ended.data.process.entities.review).to.deep.equal({ entityType: REVIEW, businessKey: 'r-bound' });
        expect(ended.data.body).to.deep.equal({ outcome: 'pending' });
    });

    it('refuses to bind a role that the start bound: a role is never rebound', async () => {
        const error = await invoke(REBINDINGS, 'start', { businessKey: 'p-rebound', entities: { contract: 'c-1' } }).catch(failed => failed);
        expect([error.code, error.message]).to.deep.equal(['conflict', "the role 'contract' is bound at the start and never rebound"]);
    });

    it('holds its participants by relations while it runs, so none can be deleted, and lets go when it ends', async () => {
        await invoke(CONTRACT, 'create', { businessKey: 'c-9', traits: { body: { name: 'Held' } } });
        await invoke(WAITINGS, 'start', { businessKey: 'p-held', entities: { contract: 'c-9' } });
        const contract = () => invoke(CONTRACT, 'read', { businessKey: 'c-9' });
        expect((await invoke(CONTRACT, 'delete', { businessKey: 'c-9', revision: (await contract()).revision }).catch(failed => failed)).code).to.equal('referenced');
        await invoke(WAITINGS, 'wake', { kind: 'signal', entityType: WAITINGS, businessKey: 'p-held', name: 'go' });
        expect((await invoke(CONTRACT, 'delete', { businessKey: 'c-9', revision: (await contract()).revision })).businessKey).to.equal('c-9');
    });

    it('refuses a step that writes to an entity that is not one of its participants, or creates one of a type no role declares', async () => {
        const { revision } = await invoke(CONTRACT, 'read', { businessKey: 'c-1' });
        const start = (businessKey, mode) => invoke(TRESPASSINGS, 'start', { businessKey, entities: { contract: 'c-2' }, input: { mode, revision } }).catch(failed => failed);
        const updating = await start('p-trespass-1', 'update');
        const creating = await start('p-trespass-2', 'create');
        expect([updating.code, creating.code]).to.deep.equal(['outside-process-footprint', 'outside-process-footprint']);
        expect(updating.message).to.include("may not").and.to.include("it isn't one of its participants");
        expect((await invoke(CONTRACT, 'read', { businessKey: 'c-1' })).data.body.name).to.not.equal('Hijacked');
    });

    it('refuses a start that leaves a role unbound, binds a late role or names a role the process lacks', async () => {
        const refusal = traits => invoke(PROCESSES, 'create', { businessKey: 'p-x', traits: { process: traits, body: {} } }).catch(error => error);
        expect((await refusal({ entities: {} })).message).to.include("the role 'contract' must be bound");
        expect((await refusal({ entities: { contract: 'c-1', stranger: 'x' } })).message).to.include("has no role 'stranger'");
        expect((await refusal({ entities: { contract: 'c-1', review: 'r-1' } })).message).to.include("the role 'review' is late");
    });
});
