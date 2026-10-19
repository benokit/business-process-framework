import { getElement } from '../../registry.js';
import { evaluate, methodScope, runMethod } from '../pipeline.js';
import { invoke } from '../invoke.js';

const lowFunction = async ({ module, functionName }) => (await import(module))[functionName];

export const calls = {
    invoke: (node, scope, input) => invoke(
        evaluate(node.invoke, scope),
        evaluate(node.operation, scope),
        input,
        scope._ctx),

    call: (node, scope, input) => runMethod(getElement(node.call).data, methodScope(scope, input)),

    execute: (node, scope, input) => runMethod(evaluate(node.execute, scope), methodScope(scope, input)),

    low: async (node, scope, input) => (await lowFunction(node.low))({ input, _ctx: scope._ctx })
};
