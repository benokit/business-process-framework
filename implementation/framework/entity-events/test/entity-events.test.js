import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../../infrastructure/postgresql/test/helpers.js';

const run = Date.now();
const ORDER = `order-events-${run}`;
const received = [];

export const record = ({ input, _ctx }) => {
    if (input.entityType === ORDER) received.push({ ...input, correlation: _ctx.trace.correlation });
    return null;
};

const elements = [
    { id: ORDER, kind: 'entity-type', data: { bodySchema: { '!amount': 'number' } } },
    { id: `${ORDER}-lifecycle`, kind: 'slot-fill', data: { target: ORDER, slot: 'traits', value: { trait: 'state', configuration: { states: { status: ['draft', 'done'] }, transitions: { finish: { from: { status: ['draft'] }, to: { status: 'done' } } }, initialStates: { default: { status: 'draft' } } } } } },
    { id: `event-recorder-${run}`, kind: 'message-consumer', data: { channel: 'entity-events', broadcast: true, handler: { low: { module: import.meta.url, functionName: 'record' } } } }
];

const packages = ['database', 'postgresql', 'transaction', 'entities', 'entity-states', 'messaging', 'messaging-nats', 'transactional-outbox', 'entity-events'];

const eventually = async (check, timeout = 10000) => {
    const deadline = Date.now() + timeout;
    while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    expect(check()).to.equal(true);
};

describe('entity-events', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('publishes create, update, trait and delete events in order', async () => {
        await invoke(ORDER, 'create', { businessKey: 'e-1', body: { amount: 1 } });
        await invoke(ORDER, 'update', { businessKey: 'e-1', revision: 1, body: { amount: 2 } });
        await invoke('entity-states', 'transition', { entityType: ORDER, businessKey: 'e-1', transition: 'finish' });
        await invoke(ORDER, 'delete', { businessKey: 'e-1' });
        await eventually(() => received.length === 4);
        expect(received.map(event => [event.eventType, event.revision])).to.deep.equal([['create', 1], ['update', 2], ['trait', 3], ['delete', 3]]);
        expect([received[1].trait, received[2].trait, received[2].command]).to.deep.equal(['body', 'state', 'finish']);
    });

    it("doesn't publish when the write rolls back", async () => {
        const before = received.length;
        await invoke(ORDER, 'create', { businessKey: 'e-2', body: { amount: 'not a number' } }).catch(() => null);
        await invoke(ORDER, 'create', { businessKey: 'e-3', body: { amount: 3 } });
        await eventually(() => received.some(event => event.businessKey === 'e-3'));
        expect(received.slice(before).map(event => event.businessKey)).to.deep.equal(['e-3']);
    });
});
