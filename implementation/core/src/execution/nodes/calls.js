import { evaluate, methodScope, runMethod } from '../pipeline.js';
import { invoke } from '../invoke.js';

const lowFunction = async ({ module, functionName }) => (await import(module))[functionName];

export const calls = {
    invoke: (node, scope, input) => invoke(
        evaluate(node.invoke, scope),
        evaluate(node.operation, scope),
        input,
        scope._ctx),

    execute: (node, scope, input) => runMethod(evaluate(node.execute, scope), methodScope(scope, input)),

    low: async (node, scope, input) => (await lowFunction(node.low))({ input, _ctx: scope._ctx })
};
