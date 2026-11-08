import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';
import { migrate, skipWithoutPostgres } from '../../../adapters/postgresql/test/helpers.js';

const run = Date.now();
const ORDER = `order-${run}`;
const PAYMENT = `payment-${run}`;

const statesOf = (initial, transitions, operations = {}) => ({
    configuration: {
        states: { status: Object.fromEntries([...new Set([initial, ...Object.values(transitions).flatMap(edges => Object.values(edges.status))])].map(state => [state, true])) },
        transitions,
        initialStates: { default: { status: initial } },
        operations
    }
});

const elements = [
    {
        id: ORDER,
        kind: 'generating-entity-type',
        data: {
            traits: {
                body: { configuration: { schema: { '!total': 'number', paid: 'boolean' } } },
                state: statesOf('open', { settle: { status: { open: 'settled' } } }, { generate: { status: { open: true } } }),
                generator: {
                    configuration: {
                        declarations: {
                            payment: {
                                type: PAYMENT,
                                open: { body: { amount: '#.input.amount' } },
                                effects: { settle: [{ key: 'body', operation: 'put', input: { value: { $merge: ['#.source.data.body', { paid: true }] } } }] }
                            }
                        }
                    }
                }
            }
        }
    },
    {
        id: PAYMENT,
        kind: 'stateful-body-entity-type',
        data: {
            traits: {
                body: { configuration: { schema: { '!amount': 'number' } } },
                state: statesOf('created', { confirm: { status: { created: 'confirmed' } } }),
                generated: { configuration: { settle: { status: { created: 'confirmed' } } } }
            }
        }
    }
];

const packages = ['integration', 'database', 'postgresql', 'transaction', 'entities', 'entities-postgresql', 'entity-states', 'entity-generation'].map(name => `@business-framework/${name}`);

const errorOf = promise => promise.then(() => null, error => error);

const generate = (businessKey, request) => invoke(ORDER, 'generate', { businessKey, ...request });

describe('entity-generation', function () {
    before(async function () {
        await skipWithoutPostgres(this);
        await boot({ paths: packages.map(packageElements), elements });
        await start();
        await migrate();
        await invoke(ORDER, 'create', { businessKey: 'o-1', traits: { body: { total: 100 } } });
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('generates an entity of the declared type, with a link to the entity that generated it', async () => {
        const order = await invoke(ORDER, 'read', { businessKey: 'o-1' });
        const payment = await generate('o-1', { generator: 'payment', key: 'p-1', input: { amount: 40 }, context: { by: 'card' } });
        expect([payment.entityType, payment.data.body, payment.data.generated]).to.deep.equal([
            PAYMENT, { amount: 40 }, { sourceType: ORDER, sourceKey: 'o-1', sourceRevision: order.revision, generator: 'payment', context: { by: 'card' } }
        ]);
    });

    it('refuses to create a generated entity other than through the entity that generates it', async () => {
        const link = { sourceType: ORDER, sourceKey: 'o-1', sourceRevision: 1, generator: 'payment' };
        const direct = await errorOf(invoke(PAYMENT, 'create', { businessKey: 'p-direct', traits: { body: { amount: 1 }, generated: link } }));
        expect([direct.code, direct.message]).to.deep.equal(['forbidden', 'a generated entity is created through the entity that generates it']);
    });

    it('writes the effect of a declaration on the entity that generated it when the generated one makes the move that is bound to it', async () => {
        const payment = await invoke(PAYMENT, 'read', { businessKey: 'p-1' });
        await invoke(PAYMENT, 'transition', { businessKey: 'p-1', revision: payment.revision, transition: 'confirm' });
        expect((await invoke(ORDER, 'read', { businessKey: 'o-1' })).data.body).to.deep.equal({ total: 100, paid: true });
    });

    it('refuses a generator the entity does not declare, and a state its model does not allow', async () => {
        expect((await errorOf(generate('o-1', { generator: 'refund', key: 'r-1' }))).code).to.equal('invalid');
        const order = await invoke(ORDER, 'read', { businessKey: 'o-1' });
        await invoke(ORDER, 'transition', { businessKey: 'o-1', revision: order.revision, transition: 'settle' });
        const error = await errorOf(generate('o-1', { generator: 'payment', key: 'p-2', input: { amount: 1 } }));
        expect([error.code, error.message]).to.deep.equal(['conflict', `${ORDER} doesn't allow generate in its current state`]);
    });

    it('answers a message of a generated entity that the entity did not generate with forbidden', async () => {
        await invoke(ORDER, 'create', { businessKey: 'o-2', traits: { body: { total: 5 } } });
        const stray = await generate('o-2', { generator: 'payment', key: 'p-3', input: { amount: 5 } });
        const error = await errorOf(invoke(ORDER, 'deliver', { businessKey: 'o-1', trait: 'generator', message: 'settle' }));
        expect(error.code).to.equal('forbidden');
        expect(stray.data.generated.sourceKey).to.equal('o-2');
    });
});
