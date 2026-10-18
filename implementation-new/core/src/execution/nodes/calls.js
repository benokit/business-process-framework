import { getElement } from '../../registry.js';
import { visibleContext } from '../../context.js';
import { evaluate, methodScope, runMethod } from '../pipeline.js';
import { invoke } from '../invoke.js';

const lowFunction = async ({ module, functionName }) => (await import(module))[functionName];

export const calls = {
    invoke: (node, scope) => invoke(
        evaluate(node.invoke, scope, node),
        evaluate(node.operation, scope, node),
        scope.input,
        scope._ctx),

    call: (node, scope) => runMethod(getElement(node.call).data, methodScope(scope)),

    execute: (node, scope) => runMethod(evaluate(node.execute, scope, node), methodScope(scope)),

    low: async (node, scope) => (await lowFunction(node.low))({ input: scope.input, _ctx: visibleContext(node, scope._ctx) })
};
