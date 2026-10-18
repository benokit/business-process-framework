import { fail } from '../../errors.js';
import { evaluate, runMethod, runPipeline } from '../pipeline.js';

export const NEXT = Symbol('next');

const runChain = (node, scope, chain) => {
    const run = (index, input, _ctx) => index === chain.length
        ? runPipeline(node.action, { ...scope, input, _ctx })
        : runMethod(chain[index], {
            input,
            self: scope.self,
            _ctx,
            [NEXT]: (nextInput, nextCtx) => run(index + 1, nextInput, nextCtx)
        });
    return run(0, scope.input, scope._ctx);
};

export const middleware = {
    middleware: (node, scope) => runChain(node, scope, evaluate(node.middleware, scope, node) ?? []),

    next: (node, scope) => (scope[NEXT] ?? fail('next-outside-middleware', "'next' used outside a middleware", {}))(scope.input, scope._ctx)
};
