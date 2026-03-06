import { expect } from 'chai';
import { execute } from 'core/service';
import { registerElement } from 'core/elements-registry';

const mathModuleUrl = new URL('./helpers/math.js', import.meta.url).href;

function registerService(id, methods) {
    const iface = {};
    const impl = {};
    for (const [name, def] of Object.entries(methods)) {
        iface[name] = { input: def.input ?? {}, output: def.output ?? {} };
        impl[name] = def.impl;
    }
    registerElement({ type: 'service', id, interface: iface, implementation: impl });
}

describe('service tests', () => {

    describe('input validation', () => {

        before(() => {
            registerService('svc-validate', {
                greet: {
                    input: { '!name': 'string' },
                    impl: { return: '#.input' }
                }
            });
        });

        it('should throw when a required input field is missing', async () => {
            let error;
            try { await execute('svc-validate', 'greet', {}); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

        it('should throw when an input field has the wrong type', async () => {
            let error;
            try { await execute('svc-validate', 'greet', { name: 42 }); }
            catch (e) { error = e; }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

    });

    describe('return', () => {

        before(() => {
            registerService('svc-return', {
                constant:    { impl: { return: 'hello' } },
                passthrough: { impl: { return: '#.input' } },
                field:       { impl: { return: '#.input.name' } },
                computed:    { impl: { return: { $sum: ['#.input.a', '#.input.b'] } } }
            });
        });

        it('should return a constant string literal', async () => {
            expect(await execute('svc-return', 'constant', {})).to.equal('hello');
        });

        it('should return the entire method input using #.input', async () => {
            expect(await execute('svc-return', 'passthrough', { x: 1 })).to.deep.equal({ x: 1 });
        });

        it('should extract a single field from method input using #.input.field', async () => {
            expect(await execute('svc-return', 'field', { name: 'Alice' })).to.equal('Alice');
        });

        it('should compute a result from input fields using lambdajson primitives', async () => {
            expect(await execute('svc-return', 'computed', { a: 3, b: 4 })).to.equal(7);
        });

    });

    describe('set', () => {

        before(() => {
            registerService('svc-set', {
                build: {
                    impl: [
                        { name: 'step1', set: { value: 42 } },
                        { return: '#.step1.value' }
                    ]
                }
            });
        });

        it('should make the set result accessible as a named step in the pipeline context', async () => {
            expect(await execute('svc-set', 'build', {})).to.equal(42);
        });

    });

    describe('pipeline', () => {

        before(() => {
            registerService('svc-pipeline', {
                compute: {
                    impl: [
                        { name: 'step1', set: { multiplied: { $multiply: ['#.input.x', 3] } } },
                        { return: { $sum: ['#.step1.multiplied', '#.input.y'] } }
                    ]
                }
            });
        });

        it('should execute steps in order and expose named step results in subsequent steps', async () => {
            expect(await execute('svc-pipeline', 'compute', { x: 4, y: 5 })).to.equal(17);
        });

    });

    describe('if/else', () => {

        before(() => {
            registerService('svc-if', {
                classify: {
                    impl: {
                        if: { $gt: ['#.input.n', 0] },
                        then: { return: 'positive' },
                        else: { return: 'non-positive' }
                    }
                }
            });
        });

        it('should execute the then branch when the condition evaluates to true', async () => {
            expect(await execute('svc-if', 'classify', { n: 5 })).to.equal('positive');
        });

        it('should execute the else branch when the condition evaluates to false', async () => {
            expect(await execute('svc-if', 'classify', { n: -1 })).to.equal('non-positive');
        });

        describe('context propagation', () => {

            before(() => {
                registerService('svc-if-ctx', {
                    checkWithContext: {
                        impl: [
                            { name: 'doubled', set: { $multiply: ['#.input.n', 2] } },
                            {
                                if: { $gt: ['#.doubled', 10] },
                                then: { return: '#.doubled' },
                                else: { return: '#.input.n' }
                            }
                        ]
                    }
                });
            });

            it('should use a prior named step in the condition and return its value from the then branch', async () => {
                expect(await execute('svc-if-ctx', 'checkWithContext', { n: 6 })).to.equal(12);
            });

            it('should use a prior named step in the condition and return input from the else branch', async () => {
                expect(await execute('svc-if-ctx', 'checkWithContext', { n: 3 })).to.equal(3);
            });

        });

    });

    describe('forEach', () => {

        before(() => {
            registerService('svc-foreach', {
                doubleAll: {
                    impl: {
                        inputMap: '#.input',
                        forEach: { return: { $multiply: ['#.input', 2] } }
                    }
                }
            });
        });

        it('should apply the body implementation to each element of the input array', async () => {
            expect(await execute('svc-foreach', 'doubleAll', [1, 2, 3])).to.deep.equal([2, 4, 6]);
        });

    });

    describe('try/catch', () => {

        before(() => {
            registerService('svc-try', {
                safeExecute: {
                    impl: {
                        try: { throw: '#.input.message' },
                        catch: { return: '#.error' }
                    }
                },
                noError: {
                    impl: {
                        try: { return: '#.input' },
                        catch: { return: 'caught' }
                    }
                }
            });
        });

        it('should run the catch body with the error in context when the try body throws', async () => {
            expect(await execute('svc-try', 'safeExecute', { message: 'boom' })).to.equal('boom');
        });

        it('should return the try body result when no error is thrown', async () => {
            expect(await execute('svc-try', 'noError', 'ok')).to.equal('ok');
        });

        describe('context propagation', () => {

            before(() => {
                registerService('svc-try-ctx', {
                    tryWithStep: {
                        impl: [
                            { name: 'greeting', set: 'hello' },
                            {
                                try:   { return: '#.greeting' },
                                catch: { return: 'error' }
                            }
                        ]
                    },
                    catchWithStep: {
                        impl: [
                            { name: 'label', set: '#.input.tag' },
                            {
                                try:   { throw: '#.input.message' },
                                catch: { return: '#.context.label' }
                            }
                        ]
                    }
                });
            });

            it('should propagate named pipeline steps into the try body', async () => {
                expect(await execute('svc-try-ctx', 'tryWithStep', {})).to.equal('hello');
            });

            it('should expose the pre-throw context at #.context in the catch body', async () => {
                expect(await execute('svc-try-ctx', 'catchWithStep', { tag: 'myLabel', message: 'boom' })).to.equal('myLabel');
            });

        });

    });

    describe('throw', () => {

        before(() => {
            registerService('svc-throw', {
                fail: { impl: { throw: '#.input.message' } }
            });
        });

        it('should throw the value produced by the lambdajson expression', async () => {
            let error;
            try { await execute('svc-throw', 'fail', { message: 'custom error' }); }
            catch (e) { error = e; }
            expect(error).to.equal('custom error');
        });

    });

    describe('switch', () => {

        before(() => {
            registerService('svc-switch', {
                route: {
                    impl: {
                        switch: {
                            value: '#.input.op',
                            cases: {
                                add:     { return: { $sum: ['#.input.a', '#.input.b'] } },
                                default: { return: 0 }
                            }
                        }
                    }
                },
                withContext: {
                    impl: [
                        { name: 'base', set: { $multiply: ['#.input.x', 2] } },
                        {
                            switch: {
                                value: '#.input.op',
                                cases: {
                                    inc:     { return: { $sum: ['#.base', '#.input.x'] } },
                                    default: { return: '#.base' }
                                }
                            }
                        }
                    ]
                }
            });
        });

        it('should execute the matching case branch', async () => {
            expect(await execute('svc-switch', 'route', { op: 'add', a: 3, b: 4 })).to.equal(7);
        });

        it('should fall through to the default case when no case matches', async () => {
            expect(await execute('svc-switch', 'route', { op: 'unknown', a: 3, b: 4 })).to.equal(0);
        });

        it('should propagate named pipeline steps into the matching case body', async () => {
            expect(await execute('svc-switch', 'withContext', { op: 'inc', x: 5 })).to.equal(15);
        });

        it('should propagate named pipeline steps into the default case body', async () => {
            expect(await execute('svc-switch', 'withContext', { op: 'other', x: 5 })).to.equal(10);
        });

    });

    describe('service call', () => {

        before(() => {
            registerService('svc-delegate-inner', {
                double: { impl: { return: { $multiply: ['#.input', 2] } } }
            });
            registerService('svc-delegate-outer', {
                compute: {
                    impl: {
                        inputMap: '#.input',
                        service: { id: 'svc-delegate-inner', method: 'double' }
                    }
                }
            });
        });

        it('should delegate to another service and return its result', async () => {
            expect(await execute('svc-delegate-outer', 'compute', 5)).to.equal(10);
        });

    });

    describe('low', () => {

        before(() => {
            registerService('svc-low', {
                echo: {
                    impl: { low: { module: mathModuleUrl, functionName: 'extractInput' } }
                }
            });
        });

        it('should call the host js function with the current context and return its result', async () => {
            expect(await execute('svc-low', 'echo', 'hello')).to.equal('hello');
        });

    });

    describe('dynamic', () => {

        before(() => {
            registerService('svc-dynamic', {
                literal: {
                    impl: { dynamic: { return: 42 } }
                },
                fromInput: {
                    impl: { dynamic: { return: '#.input.x' } }
                },
                fullContextWhenInputMapPresent: {
                    // dynamic is evaluated against the full context even when inputMap is set;
                    // '#.input.tag' is only reachable from the full context, not from the post-inputMap input
                    impl: {
                        inputMap: '#.input',
                        dynamic: { return: '#.input.tag' }
                    }
                },
                outputMapPreserved: {
                    impl: {
                        dynamic: { set: { result: '#.input.v' } },
                        outputMap: '#.result'
                    }
                },
                pipeline: {
                    impl: [
                        { name: 'computed', dynamic: { return: '#.input.x' } },
                        { return: { $multiply: ['#.computed', 3] } }
                    ]
                }
            });

            registerService('svc-dyn-math', {
                add:      { impl: { return: { $sum:      ['#.input.a', '#.input.b'] } } },
                multiply: { impl: { return: { $multiply: ['#.input.a', '#.input.b'] } } }
            });

            registerService('svc-dynamic-service', {
                // service id and method are resolved from context; inputMap shapes the operands
                dispatch: {
                    impl: {
                        inputMap: { a: '#.input.a', b: '#.input.b' },
                        dynamic: { service: { id: '#.input.svcId', method: '#.input.method' } }
                    }
                }
            });
        });

        it('should resolve a literal item descriptor and execute it', async () => {
            expect(await execute('svc-dynamic', 'literal', {})).to.equal(42);
        });

        it('should build the item descriptor using fields from the full context', async () => {
            expect(await execute('svc-dynamic', 'fromInput', { x: 7 })).to.equal(7);
        });

        it('should evaluate dynamic against the full context even when inputMap is present', async () => {
            // context = { input: { tag: 'hello' } }; '#.input.tag' is only reachable from the
            // full context — the post-inputMap input has no 'input' field
            expect(await execute('svc-dynamic', 'fullContextWhenInputMapPresent', { tag: 'hello' })).to.equal('hello');
        });

        it('should apply outputMap to the result of the dynamically resolved item', async () => {
            expect(await execute('svc-dynamic', 'outputMapPreserved', { v: 'extracted' })).to.equal('extracted');
        });

        it('should store the result of a dynamic step as a named step in the pipeline context', async () => {
            expect(await execute('svc-dynamic', 'pipeline', { x: 4 })).to.equal(12);
        });

        it('should dispatch to a service whose id and method are resolved dynamically from context', async () => {
            expect(await execute('svc-dynamic-service', 'dispatch',
                { svcId: 'svc-dyn-math', method: 'add',      a: 3, b: 4 })).to.equal(7);
            expect(await execute('svc-dynamic-service', 'dispatch',
                { svcId: 'svc-dyn-math', method: 'multiply', a: 3, b: 4 })).to.equal(12);
        });

    });

    describe('$low custom lambdajson primitives', () => {

        before(() => {
            registerService('svc-low-primitive', {
                transform: {
                    impl: {
                        return: {
                            $low: { $double: { module: mathModuleUrl, functionName: 'double' } },
                            $double: '#.input'
                        }
                    }
                }
            });
        });

        it('should use a $low-imported js function as a custom primitive within a lambdajson expression', async () => {
            expect(await execute('svc-low-primitive', 'transform', 5)).to.equal(10);
        });

    });

});
