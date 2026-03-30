import { expect } from 'chai';
import { execute } from '@business-framework/core/service';
import { registerElement } from '@business-framework/core/elements-registry';

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
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

        it('should throw when an input field has the wrong type', async () => {
            let error;
            try { await execute('svc-validate', 'greet', { name: 42 }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
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
                },
                mergeIntoExisting: {
                    impl: [
                        { name: 'acc', set: { a: 1 } },
                        { name: 'acc', set: { b: 2 } },
                        { return: '#.acc' }
                    ]
                },
                mergeIntoCtx: {
                    impl: [
                        { name: '_ctx', set: { sessionId: '#.input.id' } },
                        { return: '#._ctx.sessionId' }
                    ]
                },
                readCtxAcrossSteps: {
                    impl: [
                        { name: '_ctx', set: { tag: '#.input.tag' } },
                        { name: 'result', set: { value: '#._ctx.tag' } },
                        { return: '#.result.value' }
                    ]
                }
            });
        });

        it('should make the set result accessible as a named step in the pipeline context', async () => {
            expect(await execute('svc-set', 'build', {})).to.equal(42);
        });

        it('should merge into an existing plain object when the same name is set twice', async () => {
            expect(await execute('svc-set', 'mergeIntoExisting', {})).to.deep.equal({ a: 1, b: 2 });
        });

        it('should merge into _ctx and make the new property readable', async () => {
            expect(await execute('svc-set', 'mergeIntoCtx', { id: 'abc' })).to.equal('abc');
        });

        it('should carry _ctx properties set in earlier steps to later steps', async () => {
            expect(await execute('svc-set', 'readCtxAcrossSteps', { tag: 'hello' })).to.equal('hello');
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

    describe('finally', () => {

        before(() => {
            registerService('svc-finally', {
                successWithFinally: {
                    impl: {
                        try:     { return: '#.input.value' },
                        finally: [
                        { name: '_ctx', set: { log: 'finally ran' } },
                        { return: '#._ctx.log' }
                    ]
                    }
                },
                failWithFinally: {
                    impl: {
                        try:     { throw: '#.input.message' },
                        catch:   { return: '#.error' },
                        finally: [
                        { name: '_ctx', set: { log: 'finally ran' } },
                        { return: '#._ctx.log' }
                    ]
                    }
                },
                rethrowWithFinally: {
                    impl: {
                        try:     { throw: '#.input.message' },
                        catch:   { throw: '#.error' },
                        finally: [
                        { name: '_ctx', set: { log: 'finally ran' } },
                        { return: '#._ctx.log' }
                    ]
                    }
                },
                noCatchWithFinally: {
                    impl: {
                        try:     { throw: '#.input.message' },
                        finally: [
                        { name: '_ctx', set: { log: 'finally ran' } },
                        { return: '#._ctx.log' }
                    ]
                    }
                }
            });
        });

        it('runs finally after a successful try and returns the try result', async () => {
            const _ctx = {};
            const result = await execute('svc-finally', 'successWithFinally', { value: 42 }, _ctx);
            expect(result).to.equal(42);
            expect(_ctx.log).to.equal('finally ran');
        });

        it('runs finally after catch and returns the catch result', async () => {
            const _ctx = {};
            const result = await execute('svc-finally', 'failWithFinally', { message: 'boom' }, _ctx);
            expect(result).to.equal('boom');
            expect(_ctx.log).to.equal('finally ran');
        });

        it('runs finally when catch rethrows and propagates the error', async () => {
            const _ctx = {};
            let error;
            try { await execute('svc-finally', 'rethrowWithFinally', { message: 'boom' }, _ctx); }
            catch (e) { error = e; }
            expect(error.cause).to.equal('boom');
            expect(_ctx.log).to.equal('finally ran');
        });

        it('runs finally when there is no catch and propagates the error', async () => {
            const _ctx = {};
            let error;
            try { await execute('svc-finally', 'noCatchWithFinally', { message: 'boom' }, _ctx); }
            catch (e) { error = e; }
            expect(error.cause).to.equal('boom');
            expect(_ctx.log).to.equal('finally ran');
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
            expect(error.cause).to.equal('custom error');
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

    describe('execute', () => {

        before(() => {
            registerService('svc-execute', {
                single: {
                    impl: { execute: { return: '#.input.x' } }
                },
                pipeline: {
                    impl: {
                        execute: { '$literal': [
                            { name: 'doubled', set: { $multiply: ['#.input.x', 2] } },
                            { return: { $sum: ['#.doubled', '#.input.x'] } }
                        ] }
                    }
                },
                withInputMap: {
                    impl: {
                        inputMap: '#.input',
                        execute: { return: '#.input.x' }
                    }
                },
                fromContext: {
                    impl: { execute: '#.input.pipeline' }
                }
            });

            registerService('svc-dyn-math', {
                add:      { impl: { return: { $sum:      ['#.input.a', '#.input.b'] } } },
                multiply: { impl: { return: { $multiply: ['#.input.a', '#.input.b'] } } }
            });

            registerService('svc-execute-dispatch', {
                dispatch: {
                    impl: {
                        inputMap: { a: '#.input.a', b: '#.input.b' },
                        execute: { service: { id: '#.input.svcId', method: '#.input.method' } }
                    }
                }
            });

            registerService('svc-execute-ctx', {
                fullContextAccess: {
                    impl: {
                        inputMap: '#.input',
                        execute: { return: '#.input.tag' }
                    }
                },
                outputMapped: {
                    impl: {
                        execute: { set: { result: '#.input.v' } },
                        outputMap: '#.result'
                    }
                },
                inPipeline: {
                    impl: [
                        { name: 'computed', execute: { return: '#.input.x' } },
                        { return: { $multiply: ['#.computed', 3] } }
                    ]
                }
            });
        });

        it('should execute a single-item pipeline with the current context', async () => {
            expect(await execute('svc-execute', 'single', { x: 5 })).to.equal(5);
        });

        it('should execute a pipeline array with shared named step context', async () => {
            expect(await execute('svc-execute', 'pipeline', { x: 3 })).to.equal(9);
        });

        it('should wrap the inputMap result in input and allow access via #.input in the execute pipeline', async () => {
            expect(await execute('svc-execute', 'withInputMap', { x: 7 })).to.equal(7);
        });

        it('should evaluate the execute expression and use the result as a pipeline', async () => {
            const pipeline = { return: { $sum: ['#.input.a', '#.input.b'] } };
            expect(await execute('svc-execute', 'fromContext', { pipeline, a: 3, b: 4 })).to.equal(7);
        });

        it('should evaluate the execute expression against the full context even when inputMap is present', async () => {
            expect(await execute('svc-execute-ctx', 'fullContextAccess', { tag: 'hello' })).to.equal('hello');
        });

        it('should apply outputMap to the result of the executed pipeline', async () => {
            expect(await execute('svc-execute-ctx', 'outputMapped', { v: 'extracted' })).to.equal('extracted');
        });

        it('should store the result of an execute step as a named step in the pipeline context', async () => {
            expect(await execute('svc-execute-ctx', 'inPipeline', { x: 4 })).to.equal(12);
        });

        it('should dispatch to a service whose id and method are resolved dynamically from context', async () => {
            expect(await execute('svc-execute-dispatch', 'dispatch',
                { svcId: 'svc-dyn-math', method: 'add',      a: 3, b: 4 })).to.equal(7);
            expect(await execute('svc-execute-dispatch', 'dispatch',
                { svcId: 'svc-dyn-math', method: 'multiply', a: 3, b: 4 })).to.equal(12);
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

    describe('validateSchema', () => {

        before(() => {
            registerService('svc-validate-schema', {
                checkInline: {
                    impl: { validateSchema: { '!name': 'string', '!age': 'number' } }
                },
                checkRef: {
                    impl: [
                        { validateSchema: '@svc-validate-schema-input' },
                        { return: '#.input' }
                    ]
                },
                checkWithInputMap: {
                    impl: {
                        inputMap: '#.input.payload',
                        validateSchema: { '!amount': 'number' }
                    }
                },
                passthroughOnSuccess: {
                    impl: [
                        { validateSchema: { '!x': 'number' } },
                        { return: '#.input' }
                    ]
                }
            });
            registerElement({
                type: 'schema',
                id: 'svc-validate-schema-input',
                schema: { '!code': 'string' }
            });
        });

        it('throws when a required field is missing (inline schema)', async () => {
            let error;
            try { await execute('svc-validate-schema', 'checkInline', { name: 'Alice' }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('validation failed');
        });

        it('throws when a field has the wrong type (inline schema)', async () => {
            let error;
            try { await execute('svc-validate-schema', 'checkInline', { name: 'Alice', age: 'not-a-number' }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('validation failed');
        });

        it('throws when validation fails against a registered schema reference', async () => {
            let error;
            try { await execute('svc-validate-schema', 'checkRef', {}); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('validation failed');
        });

        it('passes and returns input unchanged when input is valid', async () => {
            const result = await execute('svc-validate-schema', 'passthroughOnSuccess', { x: 42 });
            expect(result).to.deep.equal({ x: 42 });
        });

        it('validates the inputMap result, not the full context', async () => {
            let error;
            try { await execute('svc-validate-schema', 'checkWithInputMap', { payload: { amount: 'not-a-number' } }); }
            catch (e) { error = e; }
            expect(error.cause).to.be.a('string').that.includes('validation failed');
        });

        it('passes when only the inputMap result satisfies the schema', async () => {
            const result = await execute('svc-validate-schema', 'checkWithInputMap', { payload: { amount: 99 }, extra: 'ignored' });
            expect(result).to.deep.equal({ amount: 99 });
        });

    });

    describe('$func pure-function primitives', () => {

        before(() => {
            registerElement({ type: 'data', kind: 'pure-function', id: 'double', data: { $multiply: ['#', 2] } });
            registerElement({ type: 'data', kind: 'pure-function', id: 'add-ten', data: { $sum: ['#', 10] } });
            registerService('svc-func', {
                doubleInput:    { impl: { return: { '$func/double':  '#.input' } } },
                doubleField:    { impl: { return: { '$func/double':  '#.input.n' } } },
                addTenToField:  { impl: { return: { '$func/add-ten': '#.input.n' } } },
                chainFunctions: { impl: { return: { '$func/double':  { '$func/add-ten': '#.input.n' } } } },
                inPipeline: {
                    impl: [
                        { name: 'doubled', set: { '$func/double': '#.input.n' } },
                        { return: { $sum: ['#.doubled', '#.input.n'] } }
                    ]
                }
            });
        });

        it('should apply the pure function to the entire input', async () => {
            expect(await execute('svc-func', 'doubleInput', 7)).to.equal(14);
        });

        it('should apply the pure function to a field extracted from input', async () => {
            expect(await execute('svc-func', 'doubleField', { n: 5 })).to.equal(10);
        });

        it('should apply a different pure function to a field', async () => {
            expect(await execute('svc-func', 'addTenToField', { n: 3 })).to.equal(13);
        });

        it('should support nesting pure function calls', async () => {
            expect(await execute('svc-func', 'chainFunctions', { n: 4 })).to.equal(28);
        });

        it('should work as a set expression within a pipeline', async () => {
            expect(await execute('svc-func', 'inPipeline', { n: 6 })).to.equal(18);
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
