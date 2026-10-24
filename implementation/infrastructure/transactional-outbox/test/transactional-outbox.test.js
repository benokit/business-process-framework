import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { getPool } from '@business-framework/postgresql';
import { skipWithoutPostgres } from '../../postgresql/test/helpers.js';
import { delivered, failures, outage } from './flaky-broker.js';

const BROKER = new URL('./flaky-broker.js', import.meta.url).href;
const CHANNEL = `outbox-test-${Date.now()}`;
const run = Date.now();

const low = name => ({ low: { module: BROKER, export: name, effects: ['irreversible'] } });

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

const packages = ['integration', 'database', 'postgresql', 'transaction', 'messaging', 'transactional-outbox', 'transactional-outbox-postgresql'].map(name => packageElements(`@business-framework/${name}`));

const eventually = async (check, timeout = 8000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(await check()).to.equal(true);
};

const place = (id, extra = {}) => invoke('the-orders', 'place', { message: { id: `${run}-${id}` }, ...extra, group: `${run}-${extra.group ?? id}` });

const statusOf = async messageId => (await getPool().query('SELECT status FROM transactional_outbox WHERE message_id = $1', [messageId])).rows[0]?.status;

const messageIdOf = async id => (await getPool().query("SELECT message_id FROM transactional_outbox WHERE envelope->'message'->>'id' = $1", [`${run}-${id}`])).rows[0].message_id;

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const deliveredIds = () => delivered.map(message => message.id.slice(String(run).length + 1));

describe('transactional-outbox', function () {
    this.timeout(10000);

    before(async function () {
        await skipWithoutPostgres(this);
        process.env.BPF__outbox__idleIntervalInMilliseconds = '100';
        await boot({ paths: packages, elements });
        await start();
    });

    after(async () => {
        await stop();
        delete process.env.BPF__outbox__idleIntervalInMilliseconds;
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('delivers a message right after its transaction commits', async () => {
        await place('committed');
        expect(deliveredIds()).to.include('committed');
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
        expect(deliveredIds()).to.not.include('second');
        await eventually(() => deliveredIds().includes('second'));
        expect(deliveredIds().filter(id => ['first', 'second'].includes(id))).to.deep.equal(['first', 'second']);
    });

    it('keeps messages pending through a broker outage and delivers them in order once it ends', async () => {
        outage.on = true;
        await place('outage-1', { group: 'outage' });
        await place('outage-2', { group: 'outage' });
        await place('outage-3');
        await pause(300);
        expect(await Promise.all(['outage-1', 'outage-2', 'outage-3'].map(async id => statusOf(await messageIdOf(id))))).to.deep.equal([0, 0, 0]);
        outage.on = false;
        await eventually(() => ['outage-1', 'outage-2', 'outage-3'].every(id => deliveredIds().includes(id)));
        expect(deliveredIds().filter(id => id.startsWith('outage-') && id !== 'outage-3')).to.deep.equal(['outage-1', 'outage-2']);
    });

    it('holds back the group of a failed message until it is skipped', async () => {
        failures.remaining = 4;
        await place('rejected', { group: 'held' });
        await place('held-back', { group: 'held' });
        const messageId = await messageIdOf('rejected');
        await eventually(async () => (await statusOf(messageId)) === 2);
        await pause(200);
        expect(deliveredIds()).to.not.include('held-back');
        expect(await invoke('outbox', 'skip', { messageIds: [messageId] })).to.deep.equal({ count: 1 });
        await eventually(() => deliveredIds().includes('held-back'));
        expect(deliveredIds()).to.not.include('rejected');
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
