import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';
import { skipWithoutMeilisearch } from '../../../adapters/meilisearch/test/helpers.js';

const run = Date.now();
const REVIEW = `review-task-${run}`;
const SIGNOFF = `signoff-task-${run}`;
const CONTRACT = `contract-${run}`;
const INDEX = `tasks-${run}`;

const task = outcomes => ({ configuration: { actor: 'underwriter', outcomes } });

const searched = entityType => ({ kind: 'slot-fill', data: { target: entityType, slot: 'searchIndex', value: { index: INDEX, mapping: { set: { '$func/task-search-document': '#.input' } } } } });

const elements = [
    { id: CONTRACT, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { name: 'string' } } } } } },
    { id: REVIEW, kind: 'entity-type', data: { traits: { task: task({ approved: { answer: true } }) } } },
    { id: SIGNOFF, kind: 'entity-type', data: { traits: { task: task({ signed: { answer: true } }) } } },
    searched(REVIEW),
    searched(SIGNOFF),
    { id: INDEX, kind: 'search-index', data: {} },
    { kind: 'slot-fill', data: { target: INDEX, slot: 'implementations', value: { provider: 'meilisearch-engine', settings: { filterableAttributes: ['status', 'actor', 'assignedTo', 'dueOn', 'about'] } } } },
    { id: `${INDEX}-open-of-actor`, kind: 'search-query', data: { input: { '!actor': 'string' } } },
    {
        kind: 'slot-fill',
        data: {
            target: `${INDEX}-open-of-actor`,
            slot: 'implementations',
            value: { provider: 'meilisearch-engine', implementation: { inputMap: { filter: { $str: ['status = open AND actor = ', { '$func/meilisearch-string': '#.input.actor' }] } }, invoke: INDEX, operation: 'search' } }
        }
    }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'transactional-outbox', 'transactional-outbox-postgresql', 'messaging', 'messaging-nats', 'security', 'entities', 'entities-postgresql', 'entity-events', 'entity-relations', 'entity-relations-postgresql', 'search', 'meilisearch', 'entity-search', 'entity-tasks'];

const eventually = async (check, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
    expect(await check()).to.equal(true);
};

const keysOf = async actor => (await invoke(`${INDEX}-open-of-actor`, 'run', { actor })).hits.map(hit => hit.id).sort();

describe('task work list', function () {
    this.timeout(30000);

    before(async function () {
        await skipWithoutPostgres(this);
        await skipWithoutMeilisearch(this);
        await boot({ paths: packages.map(name => packageElements(`@business-framework/${name}`)), elements });
        await start();
        await migrate();
    });

    after(async () => {
        await invoke('default-meilisearch-engine', 'deleteIndex', { indexName: INDEX }).catch(() => null);
        await stop();
    });

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('lists the open tasks of an actor across task types, and drops one once it is closed', async () => {
        const [first, second, other] = await Promise.all([
            invoke(REVIEW, 'create', { businessKey: 't-1', traits: { task: { dueOn: '2030-01-01' } } }),
            invoke(SIGNOFF, 'create', { businessKey: 't-2', traits: { task: {} } }),
            invoke(SIGNOFF, 'create', { businessKey: 't-3', traits: { task: { actor: 'auditor' } } })
        ]);
        await eventually(async () => (await keysOf('underwriter')).length === 2 && (await keysOf('auditor')).length === 1);
        await invoke(REVIEW, 'run', { businessKey: 't-1', revision: first.revision, trait: 'task', operation: 'cancel' }, { user: Object.freeze({ userId: 'system', roles: ['system'] }) });
        await eventually(async () => (await keysOf('underwriter')).length === 1);
        expect([second.businessKey, other.businessKey]).to.deep.equal(['t-2', 't-3']);
    });
});
