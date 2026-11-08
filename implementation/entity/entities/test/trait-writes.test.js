import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const COUNTER = `counter-${run}`;
const NOTIFIER = `notifier-${run}`;
const SOURCE = `source-${run}`;
const TARGET = `target-${run}`;
const CLOSABLE = `closable-${run}`;
const OUTSIDER = `outsider-${run}`;

const writeOnUpdate = {
    input: '@trait-hook-input',
    implementation: {
        if: { $eq: ['#.input.change.entityOperation', 'update'] },
        then: {
            writes: {
                entityType: '#.input.configuration.targetType',
                businessKey: '#.input.configuration.targetKey',
                entityOperation: `${COUNTER}/add`,
                operations: [{ key: COUNTER, operation: 'add', input: { by: '#.input.configuration.by' } }]
            }
        }
    }
};

const elements = [
    {
        id: `${COUNTER}-trait`,
        kind: 'kind',
        data: {
            extends: 'valued-entity-trait',
            operations: {
                initialize: { implementation: { set: 0 } },
                add: {
                    input: '@trait-operation-input',
                    output: '@trait-command',
                    implementation: [
                        { if: { $lt: ['#.input.input.by', 0] }, then: { throw: { code: 'conflict', message: 'the counter refuses' } } },
                        { set: { command: 'add', value: { $sum: ['#.input.value', '#.input.input.by'] } } }
                    ]
                },
                bump: {
                    input: '@trait-process-input',
                    output: '@any',
                    implementation: { writes: { entityType: '#.input.entityType', businessKey: '#.input.businessKey', entityOperation: { $str: ['#.input.key', '/add'] }, operations: [{ key: '#.input.key', operation: 'add', input: { by: '#.input.input.by' } }] } }
                }
            }
        }
    },
    { id: COUNTER, kind: `${COUNTER}-trait`, data: { configuration: {} } },
    {
        id: `${COUNTER}-entity-type`,
        kind: 'kind',
        data: { extends: 'body-entity-type', operations: { bump: { input: { '!businessKey': 'string', '!by': 'number' }, output: '@any', implementation: { starts: { key: COUNTER, operation: 'bump' } } } } }
    },
    {
        id: `${COUNTER}-stateful-entity-type`,
        kind: 'kind',
        data: { extends: 'stateful-body-entity-type', operations: { bump: { input: { '!businessKey': 'string', '!by': 'number' }, output: '@any', implementation: { starts: { key: COUNTER, operation: 'bump' } } } } }
    },
    {
        id: `${NOTIFIER}-trait`,
        kind: 'kind',
        data: { extends: 'valued-entity-trait', operations: { initialize: { implementation: { set: true } }, react: writeOnUpdate } }
    },
    { id: NOTIFIER, kind: `${NOTIFIER}-trait`, data: { configuration: { '!targetType': 'string', '!targetKey': 'string', '!by': 'number' } } },
    {
        id: CLOSABLE,
        kind: `${COUNTER}-stateful-entity-type`,
        data: {
            traits: {
                body: { configuration: { schema: {} } },
                [COUNTER]: { configuration: {} },
                state: {
                    configuration: {
                        states: { status: { open: true, closed: true } },
                        transitions: { close: { status: { open: 'closed' } } },
                        initialStates: { default: { status: 'open' } },
                        operations: { [`${COUNTER}/add`]: { status: { open: true } }, bump: { status: { open: true } } }
                    }
                }
            }
        }
    },
    { id: TARGET, kind: `${COUNTER}-entity-type`, data: { traits: { body: { configuration: { schema: {} } }, [COUNTER]: { configuration: {} } } } }
];

const notifier = (targetType, targetKey, by = 1) => ({ configuration: { targetType, targetKey, by } });

const sources = [
    { id: `${SOURCE}-to-target`, extra: notifier(TARGET, 'target-1') },
    { id: `${SOURCE}-refused`, extra: notifier(TARGET, 'target-1', -1) },
    { id: `${SOURCE}-itself`, extra: notifier(`${SOURCE}-itself`, 'itself-1') },
    { id: `${SOURCE}-to-closable`, extra: notifier(CLOSABLE, 'closable-1') }
].map(({ id, extra }) => ({ id, kind: 'body-entity-type', data: { traits: { body: { configuration: { schema: { '!note': 'string' } } }, [COUNTER]: { configuration: {} }, [NOTIFIER]: extra } } }));

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states'].map(name => `@business-framework/${name}`);

const errorOf = promise => promise.then(() => null, error => error);

const counterOf = async (entityType, businessKey) => (await invoke(entityType, 'read', { businessKey })).data[COUNTER];

describe('trait writes', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...sources] });
        await start();
        await migrate();
        await invoke(TARGET, 'create', { businessKey: 'target-1', traits: { body: {} } });
        await invoke(CLOSABLE, 'create', { businessKey: 'closable-1', traits: { body: {} } });
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('writes another entity from a trait, in the transaction of the move that caused it', async () => {
        const type = `${SOURCE}-to-target`;
        const created = await invoke(type, 'create', { businessKey: 's-1', traits: { body: { note: 'a' } } });
        await invoke(type, 'update', { businessKey: 's-1', revision: created.revision, value: { note: 'b' } });
        expect(await counterOf(TARGET, 'target-1')).to.equal(1);
    });

    it('rolls the move back when the trait operation refuses', async () => {
        const type = `${SOURCE}-refused`;
        const created = await invoke(type, 'create', { businessKey: 's-2', traits: { body: { note: 'a' } } });
        const error = await errorOf(invoke(type, 'update', { businessKey: 's-2', revision: created.revision, value: { note: 'b' } }));
        expect([error.code, error.message]).to.deep.equal(['conflict', 'the counter refuses']);
        expect((await invoke(type, 'read', { businessKey: 's-2' })).data.body.note).to.equal('a');
    });

    it('lets a trait write its own entity', async () => {
        const type = `${SOURCE}-itself`;
        const created = await invoke(type, 'create', { businessKey: 'itself-1', traits: { body: { note: 'a' } } });
        await invoke(type, 'update', { businessKey: 'itself-1', revision: created.revision, value: { note: 'b' } });
        const record = await invoke(type, 'read', { businessKey: 'itself-1' });
        expect([record.data.body.note, record.data[COUNTER]]).to.deep.equal(['b', 1]);
    });

    it('refuses a write from anyone but a trait', async () => {
        const error = await errorOf(invoke(TARGET, 'write', { businessKey: 'target-1', entityOperation: `${COUNTER}/add`, operations: [{ key: COUNTER, operation: 'add', input: { by: 100 } }] }));
        expect(error.code).to.equal('forbidden');
        expect(await counterOf(TARGET, 'target-1')).to.equal(1);
    });

    it('lets the state model of the written entity say in which states a write is accepted', async () => {
        const type = `${SOURCE}-to-closable`;
        const created = await invoke(type, 'create', { businessKey: 's-3', traits: { body: { note: 'a' } } });
        const updated = await invoke(type, 'update', { businessKey: 's-3', revision: created.revision, value: { note: 'b' } });
        expect(await counterOf(CLOSABLE, 'closable-1')).to.equal(1);
        const closable = await invoke(CLOSABLE, 'read', { businessKey: 'closable-1' });
        await invoke(CLOSABLE, 'transition', { businessKey: 'closable-1', revision: closable.revision, transition: 'close' });
        const error = await errorOf(invoke(type, 'update', { businessKey: 's-3', revision: updated.revision, value: { note: 'c' } }));
        expect([error.code, error.message]).to.deep.equal(['conflict', `${CLOSABLE} doesn't allow ${COUNTER}/add in its current state`]);
        expect(await counterOf(CLOSABLE, 'closable-1')).to.equal(1);
    });

    it('reports a write from a pipeline that is no trait', async () => {
        const outside = [
            { id: `${OUTSIDER}-kind`, kind: 'kind', data: { operations: { send: { input: '@any', implementation: { writes: { entityType: TARGET, businessKey: 'target-1', entityOperation: 'add', operations: [] } } } } } },
            { id: OUTSIDER, kind: `${OUTSIDER}-kind`, data: {} }
        ];
        await stop();
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...sources, ...outside] });
        expect(validate().filter(problem => problem.data.element === `${OUTSIDER}-kind`).map(problem => problem.code)).to.deep.equal(['node-outside-context']);
        await boot({ paths: packages.map(packageElements), elements: [...elements, ...sources] });
        await start();
        await migrate();
    });

    it('starts a process of a trait from outside, as the trait, through the operation a kind declares', async () => {
        const started = await invoke(TARGET, 'bump', { businessKey: 'target-1', by: 10 });
        expect(started.data[COUNTER]).to.equal(await counterOf(TARGET, 'target-1'));
        const before = await counterOf(TARGET, 'target-1');
        await invoke(TARGET, 'bump', { businessKey: 'target-1', by: 1 });
        expect(await counterOf(TARGET, 'target-1')).to.equal(before + 1);
    });

    it('has no way to start an operation of a trait that no kind declares', async () => {
        const before = await counterOf(TARGET, 'target-1');
        const error = await errorOf(invoke(TARGET, 'enter', { businessKey: 'target-1', trait: COUNTER, process: 'add', entityOperation: 'add', input: { by: 1 } }));
        expect(error.code).to.equal('private-operation');
        expect(await counterOf(TARGET, 'target-1')).to.equal(before);
    });

    it('lets the state model say in which states a process may be started', async () => {
        const closed = await invoke(CLOSABLE, 'read', { businessKey: 'closable-1' });
        const error = await errorOf(invoke(CLOSABLE, 'bump', { businessKey: 'closable-1', by: 1 }));
        expect(closed.data.state.status).to.equal('closed');
        expect([error.code, error.message]).to.deep.equal(['conflict', `${CLOSABLE} doesn't allow bump in its current state`]);
    });
});
