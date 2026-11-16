import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';

const packages = ['integration', 'database', 'postgresql', 'transaction', 'transactional-outbox', 'transactional-outbox-postgresql', 'messaging', 'messaging-nats', 'security', 'entities', 'entities-postgresql', 'entity-states', 'entity-processes'].map(name => packageElements(`@business-framework/${name}`));

const typed = { traits: { body: { configuration: { schema: { name: 'string' } } } } };

const lifecycle = { states: { status: { draft: true } }, transitions: { keep: { status: { draft: 'draft' } } }, initialStates: { default: { status: 'draft' } } };

const stale = { id: 'stale-for-test', kind: 'slot-fill', data: { target: 'error-registry', slot: 'errorTypes', value: { code: 'flaky-for-test', extends: 'unavailable', transient: true } } };

const definition = (steps, start) => ({
    id: 'sample-process',
    kind: 'process-definition',
    data: {
        entities: { contract: { entityType: 'contract-type' }, review: { entityType: 'review-type', late: true } },
        start: start ?? 'begin',
        steps
    }
});

const messagesAfterBooting = async (steps, start) => {
    await boot({
        paths: packages,
        elements: [{ id: 'contract-type', kind: 'entity-type', data: { traits: { ...typed.traits, state: { configuration: lifecycle } } } }, { id: 'review-type', kind: 'entity-type', data: typed }, stale, definition(steps, start)]
    });
    return validate().flatMap(({ data }) => data.messages ?? []);
};

const GOOD = {
    begin: { do: { set: null }, next: 'ask' },
    ask: { wait: { signals: { answered: { to: 'finish', by: 'contract' } }, until: { after: { days: 10 }, then: 'remind' } } },
    remind: { do: { set: null }, next: 'ask' },
    finish: { end: true }
};

describe('process definitions', function () {
    this.timeout(10000);

    it('accepts a definition whose steps lead to each other, wait and end', async () => {
        expect(await messagesAfterBooting(GOOD)).to.deep.equal([]);
    });

    it('reports a start that is not a step', async () => {
        expect(await messagesAfterBooting(GOOD, 'nowhere')).to.include("the start step 'nowhere' isn't a step");
    });

    it('reports a step without an exit and a step with several', async () => {
        const messages = await messagesAfterBooting({ ...GOOD, finish: {}, remind: { next: 'ask', end: true } });
        expect(messages).to.include.members([
            "step 'finish' has no exit: exactly one of next, choose, wait, end",
            "step 'remind' has next and end, which are several exits: exactly one of next, choose, wait, end"
        ]);
    });

    it('reports a step that leads to a step that does not exist, and one that cannot be reached', async () => {
        const messages = await messagesAfterBooting({ ...GOOD, begin: { next: 'nowhere' }, island: { end: true } });
        expect(messages).to.include.members([
            "step 'begin' leads to unknown step 'nowhere'",
            "step 'island' can't be reached from 'begin'",
            "step 'ask' can't be reached from 'begin'"
        ]);
    });

    it('reports steps that lead to each other without ever waiting, and accepts a loop that waits', async () => {
        const looping = await messagesAfterBooting({ ...GOOD, begin: { next: 'ask' }, ask: { choose: [[true, 'remind'], ['else', 'finish']] }, remind: { next: 'ask' } });
        expect(looping).to.include('the steps ask, remind lead to each other without ever waiting: an endless chain of immediate steps');
        expect(await messagesAfterBooting(GOOD)).to.deep.equal([]);
    });

    it('reports a choose entry that is not a test and a step', async () => {
        expect(await messagesAfterBooting({ ...GOOD, begin: { choose: [[true], 'finish'] } })).to.include("step 'begin' has a choose entry that isn't [test, step]");
    });

    it('reports a wait for nothing, an until with both a date and a duration, and a signal addressed by an unknown role', async () => {
        const messages = await messagesAfterBooting({
            ...GOOD,
            ask: { wait: { signals: { answered: { to: 'finish', by: 'nobody' } }, until: { at: '#.x', after: { days: 1 }, then: 'remind' } } },
            remind: { wait: {} }
        });
        expect(messages).to.include.members([
            "step 'ask' signal 'answered' is addressed by the role 'nobody', which the process doesn't declare",
            "step 'ask' waits until a date or after a duration: exactly one of at and after",
            "step 'remind' waits for nothing: it needs a signal or an until"
        ]);
    });

    it('reports an onError that catches nothing, an unregistered code and a transient one, and accepts a terminal code or its parent', async () => {
        const messages = await messagesAfterBooting({
            ...GOOD,
            begin: {
                next: 'ask',
                onError: [
                    { catches: [], then: 'finish' },
                    { catches: ['nobody-registered-this'], then: 'finish' },
                    { catches: ['stale', 'flaky-for-test'], then: 'finish' },
                    { catches: ['state-refused', 'conflict'], then: 'finish' }
                ]
            }
        });
        expect(messages).to.have.members([
            "step 'begin' has an onError entry that catches nothing",
            "step 'begin' catches 'nobody-registered-this', which no package registers",
            "step 'begin' catches 'stale', which is transient: a transient error is retried, so it can't be caught",
            "step 'begin' catches 'flaky-for-test', which is transient: a transient error is retried, so it can't be caught"
        ]);
    });
});
