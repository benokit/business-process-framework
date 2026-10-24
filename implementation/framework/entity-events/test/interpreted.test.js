import { expect } from 'chai';
import { boot, interpret, invoke, packageElements } from '@business-framework/core';

const ORDER = 'order';

const elements = [
    { id: ORDER, kind: 'entity-type', data: { bodySchema: { '!amount': 'number' } } },
    { id: 'positive-amount', kind: 'slot-fill', data: { target: ORDER, slot: 'guards', value: {
        if: { $lte: ['#.input.after.data.body.amount', 0] },
        then: { throw: { code: 'invalid', message: 'amount must be positive' } }
    } } },
    { id: 'audit-order', kind: 'slot-fill', data: { target: ORDER, slot: 'reactions', value: {
        inputMap: { level: 'info', message: { $join: { _strings: ['\\created ', '#.input.after.businessKey'] } } },
        invoke: 'logging', operation: 'log'
    } } }
];

const packages = ['logging', 'database', 'postgresql', 'transaction', 'entities', 'messaging', 'messaging-nats', 'transactional-outbox', 'entity-events'];

const outbox = [];
const logged = [];

const stubs = {
    transaction: { begin: () => ({ sessionId: 1 }), commit: () => null, rollback: () => null },
    'entity-database': {
        create: ({ input }) => ({ id: '00000000-0000-0000-0000-000000000001', revision: 1, timestampUtc: '2026-01-01T00:00:00.000Z', ...input })
    },
    'message-channel': {
        envelope: ({ input }) => ({ messageId: 'm-1', timestampUTC: '2026-01-01T00:00:00.000Z', group: 'g-1', correlation: 'c-1', ...input })
    },
    outbox: { put: ({ input }) => { outbox.push(input); return { messageId: `m-${outbox.length}` }; } },
    logger: { log: ({ input }) => { logged.push(input.message); return null; } }
};

describe('entity events, interpreted with stubbed effects', () => {
    before(async () => {
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        interpret({ stubs, effects: ['trace'] });
    });

    after(() => interpret());

    it('creates a record, runs its reactions and puts its event into the outbox, with no database or broker', async () => {
        const record = await invoke(ORDER, 'create', { businessKey: 'o-1', body: { amount: 1 } });
        expect(record.data.body).to.deep.equal({ amount: 1 });
        expect(logged).to.deep.equal(['created o-1']);
        expect(outbox.map(({ envelope }) => [envelope.message.eventType, envelope.message.businessKey])).to.deep.equal([['create', 'o-1']]);
    });

    it('refuses a change a guard rejects before anything is written', async () => {
        const error = await invoke(ORDER, 'create', { businessKey: 'o-2', body: { amount: 0 } }).catch(error => error);
        expect([error.code, outbox.length]).to.deep.equal(['invalid', 1]);
    });

    it('fails where a stubbed effect is reached without a stub', async () => {
        interpret({ stubs: { ...stubs, outbox: {} }, effects: ['trace'] });
        const error = await invoke(ORDER, 'create', { businessKey: 'o-3', body: { amount: 3 } }).catch(error => error);
        interpret({ stubs, effects: ['trace'] });
        expect([error.code, error.data.export]).to.deep.equal(['stubbed-effect', 'put']);
    });
});
