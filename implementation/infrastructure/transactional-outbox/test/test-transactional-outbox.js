import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { registerElement } from 'core/elements-registry';
import { connect, disconnect, getPool } from 'postgres-client';
import { initSchema } from '../src/transactional-outbox.js';
import { run, stop } from '../src/transactional-outbox-processor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POSTGRES_URL = process.env.POSTGRES_URL ?? 'postgresql://admin:password@localhost:5432/app';

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

async function clearOutbox() {
    await getPool().query('DELETE FROM transactional_outbox');
}

async function findOne(where, params) {
    const result = await getPool().query(`SELECT * FROM transactional_outbox WHERE ${where}`, params);
    return result.rows[0] ?? null;
}

async function countAll() {
    const result = await getPool().query('SELECT COUNT(*) FROM transactional_outbox');
    return parseInt(result.rows[0].count);
}

async function insertOne({ channel, envelope, status = 0, retryCount = 0, processAfterTimestampUTC }) {
    await getPool().query(
        `INSERT INTO transactional_outbox (channel, message_id, message_group, message_timestamp_utc, envelope, status, retry_count, process_after_timestamp_utc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [channel, envelope.messageId, envelope.group, envelope.timestampUTC, JSON.stringify(envelope), status, retryCount, processAfterTimestampUTC]
    );
}

describe('transactional-outbox', function () {
    let connected = false;

    before(async function () {
        const probe = new pg.Pool({ connectionString: POSTGRES_URL, max: 1 });
        try {
            const client = await probe.connect();
            client.release();
            await probe.end();
        } catch {
            console.warn('\n  WARNING: PostgreSQL not reachable — tests skipped\n');
            this.skip();
        }

        await loadElements([
            join(__dirname, '../../../core/elements'),
            join(__dirname, '../../transaction/elements'),
            join(__dirname, '../../messaging/elements'),
            join(__dirname, '../elements')
        ]);

        await connect();
        await initSchema();
        connected = true;

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
        await clearOutbox();
    });

    after(async function () {
        if (!connected) return;
        await stop();
        await clearOutbox();
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

            const item = await findOne(`message_id = $1`, ['put-1']);
            expect(item).to.exist;
            expect(item.channel).to.equal(TEST_CHANNEL_ID);
            expect(item.status).to.equal(0);
            expect(item.retry_count).to.equal(0);
            expect(item.process_after_timestamp_utc).to.equal(envelope.timestampUTC);
            expect(item.envelope.messageId).to.equal('put-1');
        });

        it('insert is rolled back when the surrounding transaction aborts', async function () {
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
                await execute('transaction', 'executeInTransaction', { program });
            } catch (e) {
                error = e;
            }
            expect(error).to.equal('deliberate rollback');
            expect(await countAll()).to.equal(0);
        });

        it('insert is committed when the surrounding transaction commits', async function () {
            const envelope = makeEnvelope('put-commit');
            const program = [
                {
                    inputMap: { channel: TEST_CHANNEL_ID, envelope: envelope },
                    service: { id: 'transactional-outbox', method: 'put' }
                }
            ];
            await execute('transaction', 'executeInTransaction', { program });

            expect(await countAll()).to.equal(1);
            const item = await findOne(`message_id = $1`, ['put-commit']);
            expect(item.envelope.messageId).to.equal('put-commit');
        });
    });

    // ------------------------------------------------------------ processor

    describe('processor', () => {
        it('picks up a waiting item and marks it as processed (status=1)', async function () {
            this.timeout(6000);
            const envelope = makeEnvelope('proc-ok');
            await execute('transactional-outbox', 'put', { channel: TEST_CHANNEL_ID, envelope });

            await run({ input: { lockIntervalInMilliseconds: 5000, idleIntervalInMilliseconds: 50 } });
            await waitFor(() => findOne(`message_id = $1 AND status = 1`, ['proc-ok']), 4000);
            await stop();

            const item = await findOne(`message_id = $1`, ['proc-ok']);
            expect(item.status).to.equal(1);
        });

        it('does not process items whose process_after_timestamp_utc is in the future', async function () {
            this.timeout(3000);
            const envelope = makeEnvelope('proc-future');
            const futureTime = new Date(Date.now() + 60_000).toISOString();
            await insertOne({ channel: TEST_CHANNEL_ID, envelope, processAfterTimestampUTC: futureTime });

            await run({ input: { lockIntervalInMilliseconds: 5000, idleIntervalInMilliseconds: 50 } });
            await sleep(300);
            await stop();

            const item = await findOne(`message_id = $1`, ['proc-future']);
            expect(item.status).to.equal(0);
        });

        it('processes only the first-in-group item (ordered by envelope.timestampUTC asc)', async function () {
            this.timeout(6000);

            const olderTs = new Date(Date.now() - 2000).toISOString();
            const newerTs = new Date(Date.now() - 1000).toISOString();
            const envelopeOlder = { ...makeEnvelope('group-older'), group: 'shared-group', timestampUTC: olderTs };
            const envelopeNewer = { ...makeEnvelope('group-newer'), group: 'shared-group', timestampUTC: newerTs };

            await insertOne({ channel: TEST_CHANNEL_ID, envelope: envelopeOlder, processAfterTimestampUTC: olderTs });
            await insertOne({ channel: TEST_CHANNEL_ID, envelope: envelopeNewer, processAfterTimestampUTC: newerTs });

            await run({ input: { lockIntervalInMilliseconds: 5000, idleIntervalInMilliseconds: 50 } });
            await waitFor(() => findOne(`message_id = $1 AND status = 1`, ['group-newer']), 6000);
            await stop();

            const olderItem = await findOne(`message_id = $1`, ['group-older']);
            const newerItem = await findOne(`message_id = $1`, ['group-newer']);
            expect(olderItem.status).to.equal(1);
            expect(newerItem.status).to.equal(1);
            expect(olderItem.processed_at <= newerItem.processed_at).to.be.true;
        });

        it('retries on publish failure and marks as failed after max attempts', async function () {
            this.timeout(10000);

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
            await insertOne({
                channel: FAIL_CHANNEL,
                envelope,
                processAfterTimestampUTC: new Date().toISOString()
            });

            await run({ input: { lockIntervalInMilliseconds: 5000, idleIntervalInMilliseconds: 50 } });
            await waitFor(() => findOne(`message_id = $1 AND status = 2`, ['proc-fail']), 8000);
            await stop();

            const item = await findOne(`message_id = $1`, ['proc-fail']);
            expect(item.status).to.equal(2);
            expect(item.retry_count).to.be.at.least(1);
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
