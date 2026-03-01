import { expect } from 'chai';
import { execute } from 'core/service';
import { registerElement } from 'core/elements-registry';

const mathModuleUrl = new URL('./helpers/math.js', import.meta.url).href;

// Register a service's interface and implementation as data elements.
// Method names are placed at the top level so getData(id)[methodName] resolves
// correctly, working around the fact that registerElement for 'service' type
// would normally handle this internally.
function registerService(id, methods) {
    const iface = {};
    const impl = {};
    for (const [name, def] of Object.entries(methods)) {
        iface[name] = { input: def.input ?? {}, output: def.output ?? {} };
        impl[name] = def.impl;
    }
    registerElement({ type: 'data', id: 'iface@' + id, ...iface, data: null });
    registerElement({ type: 'data', id: 'impl@' + id, ...impl, data: null });
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
                constant:    { impl: { return: { $return: 'hello' } } },
                passthrough: { impl: { return: { $return: '#.input' } } },
                field:       { impl: { return: { $return: '#.input.name' } } },
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
                        { return: { $return: '#.step1.value' } }
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
                        then: { return: { $return: 'positive' } },
                        else: { return: { $return: 'non-positive' } }
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

    });

    describe('forEach', () => {

        before(() => {
            registerService('svc-foreach', {
                doubleAll: {
                    impl: {
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
                        catch: { return: { $return: '#.input.error' } }
                    }
                },
                noError: {
                    impl: {
                        try: { return: { $return: '#.input' } },
                        catch: { return: { $return: 'caught' } }
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

    });

    describe('throw', () => {

        before(() => {
            registerService('svc-throw', {
                fail: { impl: { throw: { $return: '#.input.message' } } }
            });
        });

        it('should throw the value produced by the lambdajson expression', async () => {
            let error;
            try { await execute('svc-throw', 'fail', { message: 'custom error' }); }
            catch (e) { error = e; }
            expect(error).to.equal('custom error');
        });

    });

    describe('inputMap and outputMap', () => {

        before(() => {
            registerService('svc-maps', {
                process: {
                    impl: {
                        inputMap: { n: '#.input.value' },
                        return: '#.n',
                        outputMap: { doubled: { $multiply: ['#', 2] } }
                    }
                }
            });
        });

        it('should reshape input with inputMap before execution and apply outputMap to the result', async () => {
            expect(await execute('svc-maps', 'process', { value: 5 })).to.deep.equal({ doubled: 10 });
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

    describe('$low custom lambdajson primitives', () => {

        before(() => {
            registerService('svc-low-primitive', {
                transform: {
                    impl: {
                        return: {
                            $low: { double: { module: mathModuleUrl, functionName: 'double' } },
                            double: { $return: '#.input' }
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
