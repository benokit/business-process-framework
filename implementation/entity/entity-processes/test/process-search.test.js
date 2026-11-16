import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';
import { skipWithoutMeilisearch } from '../../../adapters/meilisearch/test/helpers.js';

const run = Date.now();
const CONTRACT = `contract-${run}`;
const DEFINITION = `searched-process-${run}`;
const PROCESSES = `searched-${run}`;
const INDEX = `processes-${run}`;

const elements = [
    { id: CONTRACT, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { '!name': 'string' } } } } } },
    {
        id: DEFINITION,
        kind: 'process-definition',
        data: { entities: { contract: { entityType: CONTRACT } }, start: 'hold', steps: { hold: { wait: { signals: { go: { to: 'done', by: 'contract' } }, until: { at: '2030-01-01T00:00:00.000Z', then: 'done' } } }, done: { end: true } } }
    },
    { id: PROCESSES, kind: 'process-entity-type', data: { definition: DEFINITION } },
    { kind: 'slot-fill', data: { target: PROCESSES, slot: 'searchIndex', value: { index: INDEX, mapping: { set: { '$func/process-search-document': '#.input' } } } } },
    { id: INDEX, kind: 'search-index', data: {} },
    { kind: 'slot-fill', data: { target: INDEX, slot: 'implementations', value: { provider: 'meilisearch-engine', settings: { filterableAttributes: ['status', 'waitingUntil', 'faultCode', 'entities'] } } } },
    { id: `${PROCESSES}-stuck`, kind: 'search-query', data: { input: { '!status': 'string' } } },
    {
        kind: 'slot-fill',
        data: {
            target: `${PROCESSES}-stuck`,
            slot: 'implementations',
            value: { provider: 'meilisearch-engine', implementation: { inputMap: { filter: { $str: ['status = ', '#.input.status', ' AND waitingUntil > 1800000000000'] } }, invoke: INDEX, operation: 'search' } }
        }
    }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'transactional-outbox', 'transactional-outbox-postgresql', 'messaging', 'messaging-nats', 'security', 'entities', 'entities-postgresql', 'entity-events', 'entity-states', 'entity-relations', 'entity-relations-postgresql', 'search', 'meilisearch', 'entity-search', 'entity-processes'];

const eventually = async (check, timeout = 15000) => {
    const deadline = Date.now() + timeout;
    while (!(await check()) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200));
    expect(await check()).to.equal(true);
};

const keysOf = async status => (await invoke(`${PROCESSES}-stuck`, 'run', { status })).hits.map(hit => hit.id).sort();

describe('process search', function () {
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

    it('finds the processes that are suspended, with the date they wait for, among those that run', async () => {
        await invoke(CONTRACT, 'create', { businessKey: 'c-1', traits: { body: { name: 'A' } } });
        await invoke(CONTRACT, 'create', { businessKey: 'c-2', traits: { body: { name: 'B' } } });
        await invoke(PROCESSES, 'start', { businessKey: 'p-running', entities: { contract: 'c-1' } });
        const stuck = await invoke(PROCESSES, 'start', { businessKey: 'p-stuck', entities: { contract: 'c-2' } });
        await invoke(PROCESSES, 'run', { businessKey: 'p-stuck', revision: stuck.revision, trait: 'state', operation: 'transition', input: { transition: 'suspend' } });
        await eventually(async () => (await keysOf('suspended')).length === 1);
        expect([await keysOf('suspended'), await keysOf('running')].map(ids => ids.length)).to.deep.equal([1, 1]);
    });
});
