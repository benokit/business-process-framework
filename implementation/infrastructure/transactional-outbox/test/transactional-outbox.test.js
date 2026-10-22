import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { getPool } from '@business-framework/postgresql';
import { skipWithoutPostgres } from '../../postgresql/test/helpers.js';
import { delivered, failures } from './flaky-broker.js';

const BROKER = new URL('./flaky-broker.js', import.meta.url).href;
const CHANNEL = `outbox-test-${Date.now()}`;
const run = Date.now();

const low = name => ({ low: { module: BROKER, export: name } });

const elements = [
    {
        id: 'flaky-broker',
        kind: 'kind',
        data: {
            extends: 'message-broker',
            operations: {
                publish: { implementation: low('publish') },
                subscribe: { implementation: low('subscribe') },
                unsubscribe: { implementation: low('unsubscribe') }
            }
        }
    },
    { id: 'flaky', kind: 'flaky-broker', data: {} },
    { id: CHANNEL, kind: 'message-channel', data: { broker: 'flaky', topology: 'topic', name: CHANNEL, publisher: { transactionalOutbox: true, retry: { attempts: 3, backoff: 10 } } } },
    {
        id: 'orders',
        kind: 'kind',
        data: {
            operations: {
                place: {
                    input: '@any',
                    implementation: {
                        inTransaction: [
                            { inputMap: { message: '#.input.message', group: '#.input.group' }, publish: CHANNEL },
                            { if: '#.input.fail', then: { throw: '\\rolled back' } }
                        ]
                    }
                }
            }
        }
    },
    { id: 'the-orders', kind: 'orders', data: {} }
];

const packages = ['database', 'postgresql', 'transaction', 'messaging', 'transactional-outbox'].map(name => packageElements(`@business-framework/${name}`));

const eventually = async (check, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(await check()).to.equal(true);
};

const place = (id, extra = {}) => invoke('the-orders', 'place', { message: { id: `${run}-${id}` }, group: `${run}-${extra.group ?? id}`, ...extra });

const statusOf = async messageId => (await getPool().query('SELECT status FROM transactional_outbox WHERE message_id = $1', [messageId])).rows[0]?.status;

const deliveredIds = () => delivered.map(message => message.id.slice(String(run).length + 1));

describe('transactional-outbox', function () {
    this.timeout(10000);

    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages, elements });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('delivers a message after its transaction commits', async () => {
        await place('committed');
        await eventually(() => deliveredIds().includes('committed'));
    });

    it('never delivers a message whose transaction rolled back', async () => {
        expect((await place('rolled', { fail: true }).catch(e => e)).message).to.equal('rolled back');
        await place('marker');
        await eventually(() => deliveredIds().includes('marker'));
        expect(deliveredIds()).to.not.include('rolled');
    });

    it('retries delivery when the broker fails', async () => {
        failures.remaining = 2;
        await place('retried');
        await eventually(() => deliveredIds().includes('retried'));
    });

    it('delivers the messages of one group in order', async () => {
        failures.remaining = 1;
        await place('first', { group: 'ordered' });
        await place('second', { group: 'ordered' });
        await eventually(() => deliveredIds().includes('second'));
        expect(deliveredIds().filter(id => ['first', 'second'].includes(id))).to.deep.equal(['first', 'second']);
    });

    it('keeps delivered messages for replay until they are purged', async () => {
        await place('kept');
        await eventually(() => deliveredIds().includes('kept'));
        const { messageId } = delivered.find(message => message.id.endsWith('-kept'));
        expect(await invoke('outbox', 'replay', { messageIds: [messageId] })).to.deep.equal({ count: 1 });
        await eventually(() => deliveredIds().filter(id => id === 'kept').length === 2);
        await eventually(async () => (await statusOf(messageId)) === 1);
        await invoke('outbox', 'purge', { deliveredBefore: new Date(Date.now() + 1000).toISOString() });
        expect(await statusOf(messageId)).to.equal(undefined);
        expect((await invoke('outbox', 'replay', {}).catch(error => error)).code).to.equal('invalid');
    });
});
