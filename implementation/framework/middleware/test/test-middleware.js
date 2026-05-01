import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { registerElement } from '@business-framework/runtime/elements-registry';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));

// Action pipeline: records the input it receives into _ctx.actionInput
const ACTION = [
    { outputKey: '_ctx', set: { actionInput: '#.input' } }
];

describe('middleware', function () {
    before(async function () {
        await loadElements([
            packageDir('@business-framework/definitions'),
            packageDir('@business-framework/middleware')
        ]);

        // Generic test service: fetches middlewares by kind, wraps a fixed action, executes with request
        registerElement({
            kind: 'service',
            id: 'mw-test-svc',
            data: {
                interface: { run: { input: {} } },
                implementation: {
                    run: [
                        {
                            outputKey: 'mwItems',
                            getElementsOfKind: '#.input.middlewareKind',
                            outputMap: '#.items'
                        },
                        {
                            outputKey: 'wrapped',
                            inputMap: {
                                middlewares: '#.mwItems',
                                action: { '$literal': ACTION },
                                context: '#.input.context'
                            },
                            call: 'middleware-wrap'
                        },
                        {
                            inputMap: '#.input.request',
                            execute: '#.wrapped'
                        }
                    ]
                }
            }
        });
    });

    async function run(middlewareKind, request = {}, context) {
        const _ctx = {};
        await executeService('mw-test-svc', 'run', { middlewareKind, request, context }, _ctx);
        return _ctx;
    }

    describe('no middlewares', function () {
        const KIND = 'middleware/mw-test-empty';

        it('calls the action directly with the original input', async function () {
            const _ctx = await run(KIND, { value: 42 });
            expect(_ctx.actionInput).to.deep.equal({ value: 42 });
        });
    });

    describe('single middleware', function () {
        const KIND = 'middleware/mw-test-single';

        before(function () {
            registerElement({
                id: 'mw-single', kind: KIND,
                data: {
                    ordering: 1,
                    implementation: {
                        inputMap: { '$merge': ['#.input.input', { mwApplied: true }] },
                        execute: '#.input.next'
                    }
                }
            });
        });

        it('action receives the input as modified by the middleware', async function () {
            const _ctx = await run(KIND, { value: 1 });
            expect(_ctx.actionInput.value).to.equal(1);
            expect(_ctx.actionInput.mwApplied).to.be.true;
        });
    });

    describe('ordering', function () {
        const KIND = 'middleware/mw-test-order';

        before(function () {
            // Registered in reverse order to verify sorting is by `ordering`, not registration order
            registerElement({
                id: 'mw-order-20', kind: KIND,
                data: {
                    ordering: 20,
                    implementation: {
                        inputMap: { '$merge': ['#.input.input', { lastStep: 20 }] },
                        execute: '#.input.next'
                    }
                }
            });
            registerElement({
                id: 'mw-order-10', kind: KIND,
                data: {
                    ordering: 10,
                    implementation: {
                        inputMap: { '$merge': ['#.input.input', { lastStep: 10 }] },
                        execute: '#.input.next'
                    }
                }
            });
        });

        it('applies middlewares in ascending ordering', async function () {
            const _ctx = await run(KIND, {});
            // ordering 10 sets lastStep:10, then ordering 20 overwrites with 20
            expect(_ctx.actionInput.lastStep).to.equal(20);
        });
    });

    describe('short-circuit', function () {
        const KIND = 'middleware/mw-test-short';

        before(function () {
            registerElement({
                id: 'mw-short', kind: KIND,
                data: {
                    ordering: 1,
                    implementation: { return: { blocked: true } }
                }
            });
        });

        it('does not reach the action when a middleware short-circuits', async function () {
            const _ctx = await run(KIND, {});
            expect(_ctx.actionInput).to.be.undefined;
        });
    });

    describe('context', function () {
        const KIND = 'middleware/mw-test-ctx';

        before(function () {
            registerElement({
                id: 'mw-ctx', kind: KIND,
                data: {
                    ordering: 1,
                    implementation: {
                        inputMap: { '$merge': ['#.input.input', { tenantId: '#.input.context.tenantId' }] },
                        execute: '#.input.next'
                    }
                }
            });
        });

        it('passes context to each middleware', async function () {
            const _ctx = await run(KIND, {}, { tenantId: 'tenant-abc' });
            expect(_ctx.actionInput.tenantId).to.equal('tenant-abc');
        });
    });
});
