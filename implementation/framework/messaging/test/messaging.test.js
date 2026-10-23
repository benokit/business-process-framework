import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { deliverAll, published, reset } from './fixtures/memory-broker.js';
import { received } from './fixtures/recorder.js';

const BROKER = new URL('./fixtures/memory-broker.js', import.meta.url).href;
const RECORDER = new URL('./fixtures/recorder.js', import.meta.url).href;

const lowOf = (module, name) => ({ low: { module, export: name } });

const elements = [
    {
        id: 'memory-broker',
        kind: 'kind',
        data: {
            extends: 'message-broker',
            operations: {
                publish: { implementation: lowOf(BROKER, 'publish') },
                subscribe: { implementation: lowOf(BROKER, 'subscribe') },
                unsubscribe: { implementation: lowOf(BROKER, 'unsubscribe') }
            }
        }
    },
    { id: 'memory', kind: 'memory-broker', data: {} },
    { id: 'orders', kind: 'message-channel', data: { broker: 'memory', topology: 'topic', name: 'orders' } },
    { id: 'audit-orders', kind: 'message-consumer', data: { channel: 'orders', handler: lowOf(RECORDER, 'record') } },
    {
        id: 'order-service',
        kind: 'kind',
        data: {
            operations: {
                place: { input: '@any', implementation: { inputMap: { message: { orderId: '#.input.orderId' }, group: '#.input.orderId', subject: '\\placed' }, publish: 'orders' } }
            }
        }
    },
    { id: 'shop', kind: 'order-service', data: {} },
    { id: 'relay-orders', kind: 'message-consumer', data: { channel: 'orders', handler: { if: '#.input.relay', then: { inputMap: { message: { relayed: true } }, publish: 'orders' } } } }
];

describe('messaging', () => {
    beforeEach(async () => {
        reset();
        received.length = 0;
        await boot({ paths: [packageElements('@business-framework/messaging')], elements });
        await start();
    });

    afterEach(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('reports a channel publishing through a transactional outbox when there is none', async () => {
        await stop();
        const payments = { id: 'payments', kind: 'message-channel', data: { broker: 'memory', topology: 'queue', name: 'payments', publisher: { transactionalOutbox: true } } };
        await boot({ paths: [packageElements('@business-framework/messaging')], elements: [...elements, payments] });
        expect(validate().map(({ code, data }) => [code, data.element])).to.deep.equal([['invalid-element', 'payments']]);
    });

    it('publishes an envelope with id, time, group, subject and a new correlation', async () => {
        await invoke('shop', 'place', { orderId: 'o-1' });
        const [{ channel, envelope }] = published;
        expect(channel).to.equal('orders');
        expect(envelope).to.include({ group: 'o-1' }).and.to.have.all.keys('messageId', 'timestampUTC', 'group', 'subject', 'correlation', 'message');
        expect(envelope.message).to.deep.equal({ orderId: 'o-1' });
    });

    it('hands the message to consumers with message and trace bound', async () => {
        await invoke('shop', 'place', { orderId: 'o-2' });
        const { envelope } = published[0];
        await deliverAll();
        const [{ input, _ctx }] = received;
        expect(input).to.deep.equal({ orderId: 'o-2' });
        expect(_ctx.message).to.deep.equal({ channel: 'orders', messageId: envelope.messageId, group: 'o-2', subject: 'placed', timestampUTC: envelope.timestampUTC });
        expect(_ctx.trace).to.deep.equal({ correlation: envelope.correlation });
    });

    it('propagates the correlation of a consumed message to the messages it publishes', async () => {
        await invoke('orders', 'publish', { message: { relay: true } });
        const { correlation } = published[0].envelope;
        await deliverAll();
        expect(published.map(({ envelope }) => [envelope.message, envelope.correlation])).to.deep.equal([[{ relayed: true }, correlation]]);
    });

    it('unsubscribes consumers on stop', async () => {
        await stop();
        await invoke('orders', 'publish', { message: { late: true } });
        await deliverAll();
        expect(received).to.deep.equal([]);
    });
});
