import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { registerElement } from 'core/elements-registry';
import { connect, disconnect, getCollection } from 'mongodb-client';
import { run, stop } from 'transactional-outbox/processor';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONGODB_URL = process.env.MONGODB_URL ?? 'mongodb://admin:password@localhost:27017/admin';
const COLLECTION = 'transactional-outbox';

const TEST_BROKER_ID = 'test-outbox-broker';
const TEST_BROKER_SERVICE = 'test-outbox-broker-service';
const TEST_CHANNEL_ID = 'test-outbox-channel';

function makeEnvelope(id) {
    return {
        messageId: id,
        timestampUTC: new Date().toISOString(),
        group: 'test-group',
        correlation: 'corr-1',
        message: { payload: id }
    };
}

describe('transactional-outbox', function () {
    let connected = false;
    let transactionsSupported = false;

    before(async function () {
        const probe = new MongoClient(MONGODB_URL, { serverSelectionTimeoutMS: 2000 });
        try {
            await probe.connect();
            await probe.db().command({ ping: 1 });
            const info = await probe.db().admin().command({ isMaster: 1 });
            transactionsSupported = !!(info.setName || info.msg === 'isdbgrid');
            await probe.close();
        } catch {
            console.warn('\n  WARNING: MongoDB not reachable — tests skipped\n');
            this.skip();
        }

        await loadElements([
            join(__dirname, '../../../core/elements'),
            join(__dirname, '../../transaction/elements'),
            join(__dirname, '../../messaging/elements'),
            join(__dirname, '../elements')
        ]);

        await connect();
        connected = true;

        // Mock broker service: publish succeeds and returns messageId
        registerElement({
            type: 'service',
            id: TEST_BROKER_SERVICE,
            interface: { publish: { input: {}, output: {} } },
            implementation: { publish: { return: { messageId: '#.input.envelope.messageId' } } }
        });
        registerElement({
            type: 'data',
            id: TEST_BROKER_ID,
            meta: { kind: 'message-broker' },
            data: { service: TEST_BROKER_SERVICE }
        });
        registerElement({
            type: 'data',
            id: TEST_CHANNEL_ID,
            data: {
                broker: TEST_BROKER_ID,
                topology: 'queue',
                name: 'test-queue',
                publisher: { retry: { attempts: 2, backoff: 10 } }
            }
        });
    });

    beforeEach(async function () {
        if (!connected) return;
        await getCollection(COLLECTION).deleteMany({});
    });

    after(async function () {
        if (!connected) return;
        await stop();
        await getCollection(COLLECTION).deleteMany({});
        await disconnect();
    });

    // ------------------------------------------------------------------ put

    describe('put', () => {
        it('inserts an outbox item with status=0', async function () {
            const envelope = makeEnvelope('put-1');
            const result = await execute('transactional-outbox', 'put', {
                channel: TEST_CHANNEL_ID,
                envelope
            });
            expect(result).to.deep.equal({ messageId: 'put-1' });

            const items = await getCollection(COLLECTION).find({}).toArray();
            expect(items).to.have.length(1);
            const [item] = items;
            expect(item.channel).to.equal(TEST_CHANNEL_ID);
            expect(item.status).to.equal(0);
            expect(item.retryCount).to.equal(0);
            expect(item.processAfterTimestampUTC).to.equal(envelope.timestampUTC);
            expect(item.envelope.messageId).to.equal('put-1');
        });

        it('insert is rolled back when the surrounding transaction aborts', async function () {
            if (!transactionsSupported) return this.skip();
            const envelope = makeEnvelope('put-rollback');
            const program = [
                {
                    inputMap: { channel: TEST_CHANNEL_ID, envelope: envelope },
                    service: { id: 'transactional-outbox', method: 'put' }
                },
                { throw: 'deliberate rollback' }
            ];

            let error;
            try {
                await execute('transaction-mongodb', 'executeInTransaction', { program });
            } catch (e) {
                error = e;
            }
            expect(error).to.equal('deliberate rollback');
            const count = await getCollection(COLLECTION).countDocuments({});
            expect(count).to.equal(0);
        });

        it('insert is committed when the surrounding transaction commits', async function () {
            if (!transactionsSupported) return this.skip();
            const envelope = makeEnvelope('put-commit');
            const program = [
                {
                    inputMap: { channel: TEST_CHANNEL_ID, envelope: envelope },
                    service: { id: 'transactional-outbox', method: 'put' }
                }
            ];
            await execute('transaction-mongodb', 'executeInTransaction', { program });

            const items = await getCollection(COLLECTION).find({}).toArray();
            expect(items).to.have.length(1);
            expect(items[0].envelope.messageId).to.equal('put-commit');
        });
    });

    // ------------------------------------------------------------ processor

    describe('processor', () => {
        it('picks up a waiting item and marks it as processed (status=1)', async function () {
            if (!transactionsSupported) return this.skip();
            this.timeout(6000);
            const col = getCollection(COLLECTION);
            const envelope = makeEnvelope('proc-ok');
            await execute('transactional-outbox', 'put', { channel: TEST_CHANNEL_ID, envelope });

            await run({ input: { lockIntervalInMilliseconds: 5000, idleIntervalInMilliseconds: 50 } });
            await waitFor(() => col.findOne({ 'envelope.messageId': 'proc-ok', status: 1 }), 4000);
            await stop();

            const item = await col.findOne({ 'envelope.messageId': 'proc-ok' });
            expect(item.status).to.equal(1);
        });

        it('does not process items whose processAfterTimestampUTC is in the future', async function () {
            this.timeout(3000);
            const col = getCollection(COLLECTION);
            const envelope = makeEnvelope('proc-future');
            const futureTime = new Date(Date.now() + 60_000).toISOString();
            await col.insertOne({
                channel: TEST_CHANNEL_ID,
                retryCount: 0,
                status: 0,
                processAfterTimestampUTC: futureTime,
                envelope
            });

            await run({ input: { lockIntervalInMilliseconds: 5000, idleIntervalInMilliseconds: 50 } });
            await sleep(300);
            await stop();

            const item = await col.findOne({ 'envelope.messageId': 'proc-future' });
            expect(item.status).to.equal(0);
        });

        it('processes only the first-in-group item (ordered by envelope.timestampUTC asc)', async function () {
            if (!transactionsSupported) return this.skip();
            this.timeout(6000);
            const col = getCollection(COLLECTION);

            const olderTs = new Date(Date.now() - 2000).toISOString();
            const newerTs = new Date(Date.now() - 1000).toISOString();
            const envelopeOlder = { ...makeEnvelope('group-older'), group: 'shared-group', timestampUTC: olderTs };
            const envelopeNewer = { ...makeEnvelope('group-newer'), group: 'shared-group', timestampUTC: newerTs };

            await col.insertMany([
                { channel: TEST_CHANNEL_ID, retryCount: 0, status: 0, processAfterTimestampUTC: olderTs, envelope: envelopeOlder },
                { channel: TEST_CHANNEL_ID, retryCount: 0, status: 0, processAfterTimestampUTC: newerTs, envelope: envelopeNewer }
            ]);

            await run({ input: { lockIntervalInMilliseconds: 5000, idleIntervalInMilliseconds: 50 } });
            await waitFor(() => col.findOne({ 'envelope.messageId': 'group-newer', status: 1 }), 6000);
            await stop();

            const olderItem = await col.findOne({ 'envelope.messageId': 'group-older' });
            const newerItem = await col.findOne({ 'envelope.messageId': 'group-newer' });
            expect(olderItem.status).to.equal(1);
            expect(newerItem.status).to.equal(1);
            // group-older must have been processed before group-newer
            expect(olderItem.processedAt <= newerItem.processedAt).to.be.true;
        });

        it('retries on publish failure and marks as failed after max attempts', async function () {
            if (!transactionsSupported) return this.skip();
            this.timeout(10000);
            const col = getCollection(COLLECTION);

            const FAIL_SERVICE = 'test-fail-broker-service';
            const FAIL_BROKER = 'test-fail-broker';
            const FAIL_CHANNEL = 'test-fail-channel';

            registerElement({
                type: 'service',
                id: FAIL_SERVICE,
                interface: { publish: { input: {}, output: {} } },
                implementation: { publish: { throw: 'broker publish error' } }
            });
            registerElement({
                type: 'data', id: FAIL_BROKER,
                meta: { kind: 'message-broker' },
                data: { service: FAIL_SERVICE }
            });
            registerElement({
                type: 'data', id: FAIL_CHANNEL,
                data: {
                    broker: FAIL_BROKER,
                    topology: 'queue',
                    name: 'fail-queue',
                    publisher: { retry: { attempts: 1, backoff: 1 } }
                }
            });

            const envelope = makeEnvelope('proc-fail');
            await col.insertOne({
                channel: FAIL_CHANNEL,
                retryCount: 0,
                status: 0,
                processAfterTimestampUTC: new Date().toISOString(),
                envelope
            });

            await run({ input: { lockIntervalInMilliseconds: 5000, idleIntervalInMilliseconds: 50 } });
            await waitFor(() => col.findOne({ 'envelope.messageId': 'proc-fail', status: 2 }), 8000);
            await stop();

            const item = await col.findOne({ 'envelope.messageId': 'proc-fail' });
            expect(item.status).to.equal(2);
            expect(item.retryCount).to.be.at.least(1);
        });
    });
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const result = await predicate();
        if (result) return result;
        await sleep(50);
    }
    throw new Error('waitFor timed out after ' + timeoutMs + 'ms');
}
