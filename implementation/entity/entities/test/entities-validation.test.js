import { expect } from 'chai';
import { fileURLToPath } from 'url';
import { boot, packageElements, validate } from '@business-framework/core';

const run = 'fixture';
const ORDER = `order-${run}`;
const NOTE = `note-${run}`;
const WRITING = `writing-${run}`;
const TOTAL = `total-${run}`;
const CONTRACT_CLASS = `contract-${run}`;

const fill = (id, target, slot, value, order = {}) => ({ id: `${id}-${run}`, kind: 'slot-fill', data: { target, slot, value, ...order } });

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'scenarios'];

const fixtures = fileURLToPath(new URL('./scenarios', import.meta.url));

const bootWith = elements => boot({ paths: [...packages.map(name => packageElements(`@business-framework/${name}`)), fixtures], elements });

describe('validation of entity types and traits', () => {
    it('reports two traits that offer the same public operation', async () => {
        const offering = id => ({
            id: `${id}-trait`,
            kind: 'kind',
            data: { extends: 'entity-trait', operations: { refresh: { public: true, input: { '$data#&': ['@trait-operation-input', { '!input': 'object' }] }, output: '@trait-command', implementation: { set: { command: 'refresh', value: 1 } } } } }
        });
        const broken = [
            offering(`first-${run}`),
            offering(`second-${run}`),
            { id: `first-${run}`, kind: `first-${run}-trait`, data: { configuration: {} } },
            { id: `second-${run}`, kind: `second-${run}-trait`, data: { configuration: {} } },
            { id: `offering-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, [`first-${run}`]: { configuration: {} }, [`second-${run}`]: { configuration: {} } } } }
        ];
        await bootWith(broken);
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages).to.include(`offering-${run}: the traits first-${run} and second-${run} both offer the operation 'refresh'`);
    });

    it('reports a dependency on a key the entity type has no trait for, and one on a trait without a derive', async () => {
        const broken = [
            { id: `depending-${run}`, kind: WRITING, data: { traits: { body: { configuration: { schema: {} }, dependsOn: ['body'] }, [TOTAL]: { configuration: {}, dependsOn: ['body', 'missing'] } } } }
        ];
        await bootWith(broken);
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages).to.include.members([
            `trait '${TOTAL}' of depending-${run} depends on 'missing', which the entity type has no trait for`,
            `trait 'body' of depending-${run} depends on keys and has no derive`
        ]);
    });

    it('reports a guard hook of a trait that writes', async () => {
        const writing = [
            {
                id: `writing-hook-${run}-trait`,
                kind: 'kind',
                data: {
                    extends: 'valued-entity-trait',
                    operations: { initialize: { implementation: { set: true } } }
                }
            },
            {
                id: `writing-hook-${run}`,
                kind: `writing-hook-${run}-trait`,
                data: {
                    configuration: {},
                    guard: { inputMap: { businessKey: 'o-raced', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } }, invoke: ORDER, operation: 'run' }
                }
            },
            { id: `hooking-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, [`writing-hook-${run}`]: { configuration: {} } } } }
        ];
        await bootWith(writing);
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages.some(message => message.startsWith(`trait 'writing-hook-${run}': its guard may only read and trace, but has write: `))).to.equal(true);
    });

    it('reports a derive hook and a command operation of a trait that write', async () => {
        const id = `writing-derive-${run}`;
        const writing = [
            {
                id: `${id}-trait`,
                kind: 'kind',
                data: {
                    extends: 'valued-entity-trait',
                    operations: {
                        initialize: { implementation: { set: true } },
                        rewrite: {
                            input: '@trait-operation-input',
                            output: '@trait-command',
                            implementation: [{ inputMap: { businessKey: 'o-raced', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } }, invoke: ORDER, operation: 'run' }, { set: { command: 'rewrite', value: true } }]
                        }
                    }
                }
            },
            {
                id,
                kind: `${id}-trait`,
                data: {
                    configuration: {},
                    derive: { inputMap: { businessKey: 'o-raced', revision: 1, trait: 'body', operation: 'update', input: { value: { amount: 2 } } }, invoke: ORDER, operation: 'run' }
                }
            },
            { id: `deriving-writer-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, [id]: { configuration: {}, dependsOn: ['body'] } } } }
        ];
        await bootWith(writing);
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages.some(message => message.startsWith(`trait '${id}': its derive may only read and trace, but has write: `))).to.equal(true);
        expect(messages.some(message => message.startsWith(`trait '${id}': its operation 'rewrite' returns a command, so it may only read and trace, but has write: `))).to.equal(true);
    });

    it('reports invalid trait uses in validate()', async () => {
        const broken = [
            { id: `schemaless-${run}`, kind: 'entity-type', data: { traits: { body: {} } } },
            { id: `bad-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: {} } }, unknown: {}, [NOTE]: { configuration: { prefix: 1 } } } } },
            { id: `dual-${run}`, kind: 'entity-type', data: { traits: { body: { configuration: { schema: { holder: 'string', '!holder': 'string' } } } } } },
            { id: `conflicting-${run}`, kind: CONTRACT_CLASS, data: { traits: { body: { configuration: { schema: {} } } } } },
            fill('conflicting-note', `conflicting-${run}`, 'traits', { key: NOTE, configuration: { prefix: 'other' } }),
            fill('bad-configuration', `bad-${run}`, 'traits', { trait: NOTE, configuration: { prefix: 1 } }),
            fill('not-a-trait', ORDER, 'traits', { trait: 'postgresql', configuration: {} }),
            fill('repeated-note', CONTRACT_CLASS, 'traits', { trait: NOTE, configuration: { prefix: 'again' } }),
            fill('keyed-note', `bad-${run}`, 'traits', { trait: NOTE, key: 'memo', configuration: { prefix: 'p' } }),
            fill('body-note', `bad-${run}`, 'traits', { trait: NOTE, key: 'body', configuration: { prefix: 'p' } }),
            fill('dotted-note', `bad-${run}`, 'traits', { trait: NOTE, key: 'first.one', configuration: { prefix: 'p' } }),
            { id: `undated-field-${run}`, kind: 'entity-type', data: { traits: { body: { trait: 'versioned-body', configuration: { schema: { startDate: 'string:^x$' }, versioned: { validFrom: '/startDate' } } } } } },
            { id: `missing-field-${run}`, kind: 'entity-type', data: { traits: { body: { trait: 'versioned-body', configuration: { schema: { startDate: 'string' }, versioned: { validFrom: '/begin' } } } } } }
        ];
        await bootWith(broken);
        const messages = validate().flatMap(problem => problem.data.messages ?? []);
        expect(messages).to.include.members([
            `trait '${NOTE}': configuration/prefix must be string`,
            "trait 'body': configuration must have required property 'schema'",
            "'unknown' is not an entity trait",
            `traits.${NOTE} is injected by bad-configuration-${run} and not declared by entity-type`,
            "trait 'body': configuration.schema.holder is both optional and required",
            "'postgresql' is not an entity trait",
            `trait '${NOTE}' is used twice on ${CONTRACT_CLASS}`,
            `trait '${NOTE}' is used under the key 'memo', and its key is '${NOTE}'`,
            `key 'body' is used by the traits body and ${NOTE}`,
            "key 'first.one' is not lowercase letters and digits in segments joined by '-'",
            `undated-field-${run}: the field '/startDate' of the versioned body is no date (a string that matches YYYY-MM-DD)`,
            `missing-field-${run}: the pointer '/begin' of the versioned body is no field of its schema`
        ]);
        expect(messages.some(message => message.includes("can't change the value at 'configuration.prefix'"))).to.equal(true);
    });
});
