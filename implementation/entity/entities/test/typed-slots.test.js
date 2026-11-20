import { expect } from 'chai';
import { boot, packageElements, validate } from '@business-framework/core';

const packages = ['integration', 'database', 'postgresql', 'transaction', 'messaging', 'security', 'entities', 'entities-postgresql', 'entity-relations', 'entity-events', 'search', 'entity-search'].map(name => packageElements(`@business-framework/${name}`));

const typed = schema => ({ traits: { body: { configuration: { schema } } } });

const fill = (id, target, value, slot = 'requestGuards') => ({ id, kind: 'slot-fill', data: { target, slot, ...slot === 'requestGuards' && { on: 'read' }, value } });

const problemsOf = async elements => {
    await boot({ paths: packages, elements });
    return validate().filter(({ code }) => code === 'unknown-path').map(({ data }) => [data.element, data.path]);
};

describe('typed slots of entity-type', () => {
    it('types the viewed record of a guard by the body schema of the entity type the fill targets', async () => {
        expect(await problemsOf([
            { id: 'order-type', kind: 'entity-type', data: typed({ '!total': 'number', '*': 'never' }) },
            fill('good-guard', 'order-type', { set: '#.input.before.data.body.total' }),
            fill('bad-guard', 'order-type', { set: '#.input.before.data.body.totl' })
        ])).to.deep.equal([['bad-guard', 'value.set']]);
    });

    it('types the record of a fill on a kind by the entity types that are its instances', async () => {
        expect(await problemsOf([
            { id: 'sized-type', kind: 'kind', data: { extends: 'entity-type' } },
            { id: 'small-type', kind: 'sized-type', data: typed({ '!size': 'number', '*': 'never' }) },
            { id: 'large-type', kind: 'sized-type', data: typed({ '!size': 'number', '*': 'never' }) },
            fill('size-guard', 'sized-type', { set: '#.input.before.data.body.size' }),
            fill('typo-guard', 'sized-type', { set: '#.input.before.data.body.sise' })
        ])).to.deep.equal([['typo-guard', 'value.set']]);
    });
});

describe('typed hooks of entity-trait', () => {
    it('types the input of the hooks of a trait: its configuration by the schema the trait declares, the change, the record to derive from', async () => {
        const trait = (id, data) => ({ id, kind: 'entity-trait', data: { configuration: { '!prefix': 'string', '*': 'never' }, ...data } });
        expect(await problemsOf([
            trait('good-trait', {
                view: { $str: ['#.configuration.prefix', '#.value'] },
                guard: { set: { $str: ['#.input.configuration.prefix', '#.input.change.operation'] } },
                derive: { set: '#.input.record.businessKey' }
            }),
            trait('bad-trait', {
                view: { set: '#.configuration.prefx' },
                guard: { set: '#.input.configuration.prefx' },
                react: { set: '#.input.change.operaton' },
                derive: { set: '#.input.record.businessKye' }
            })
        ])).to.deep.equal([['bad-trait', 'view.set'], ['bad-trait', 'guard.set'], ['bad-trait', 'react.set'], ['bad-trait', 'derive.set']]);
    });
});

describe('typed operation outputs of entity-type', () => {
    it('types the record an invoke of read returns by the entity type it invokes', async () => {
        expect(await problemsOf([
            { id: 'order-type', kind: 'entity-type', data: typed({ '!total': 'number', '*': 'never' }) },
            { id: 'reader', kind: 'kind', data: { operations: { run: { input: '@any', implementation: [
                { outputKey: 'order', inputMap: { businessKey: 'O-1' }, invoke: 'order-type', operation: 'read' },
                { set: '#.order.data.body.total' },
                { set: '#.order.data.body.totl' }
            ] } } } }
        ])).to.deep.equal([['reader', 'operations.run.implementation[2].set']]);
    });
});

describe('typed records of the slots that see a viewed record', () => {
    const order = { id: 'order-type', kind: 'entity-type', data: typed({ '!total': 'number', '*': 'never' }) };

    it('types the after of a reaction, whole or partial, and the records of eventGroup, relations and searchIndex', async () => {
        expect(await problemsOf([
            order,
            fill('good-reaction', 'order-type', { set: '#.input.after.data.body.total' }, 'reactions'),
            fill('bad-reaction', 'order-type', { set: '#.input.after.data.body.totl' }, 'reactions'),
            fill('bad-group', 'order-type', '#.data.body.totl', 'eventGroup'),
            fill('bad-relations', 'order-type', { set: '#.input.data.body.totl' }, 'relations'),
            fill('bad-index', 'order-type', { index: 'nowhere', mapping: { set: '#.input.data.body.totl' } }, 'searchIndex')
        ])).to.have.deep.members([
            ['bad-reaction', 'value.set'],
            ['bad-group', 'value'],
            ['bad-relations', 'value.set'],
            ['bad-index', 'value.mapping.set']
        ]);
    });
});
