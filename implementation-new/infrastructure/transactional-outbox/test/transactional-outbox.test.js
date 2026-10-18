import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { skipWithoutPostgres } from '../../postgresql/test/helpers.js';
import { delivered, failures } from './flaky-broker.js';

const BROKER = new URL('./flaky-broker.js', import.meta.url).href;
const CHANNEL = `outbox-test-${Date.now()}`;
const run = Date.now();

const low = functionName => ({ low: { module: BROKER, functionName } });

const elements = [
    {
        id: 'flaky-broker',
        kind: 'kind',
        data: {
            extends: 'message-broker',
            operations: {
                publish: { input: '@any', implementation: low('publish') },
                subscribe: { input: '@any', implementation: low('subscribe') },
                unsubscribe: { input: '@any', implementation: low('unsubscribe') }
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
    while (!check() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    expect(check()).to.equal(true);
};

const place = (id, extra = {}) => invoke('the-orders', 'place', { message: { id: `${run}-${id}` }, group: `${run}-${extra.group ?? id}`, ...extra });

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
});
