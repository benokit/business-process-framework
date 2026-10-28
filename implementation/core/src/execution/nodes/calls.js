import { evaluate, methodScope, Return, runMethod } from '../pipeline.js';
import { invoke } from '../invoke.js';
import { checkEffects } from '../interpreter.js';
import { CoreError } from '../../errors.js';

const foreign = ({ module, export: name }) => error => {
    throw error instanceof CoreError || error instanceof Return
        ? error
        : new CoreError('low-failed', `${name} of ${module}: ${error?.message ?? error}`, { module, export: name }, error);
};

const lowFunction = async ({ module, export: name }) => (await import(module))[name];

export const calls = {
    invoke: (node, scope, input) => invoke(
        evaluate(node.invoke, scope),
        evaluate(node.operation, scope),
        input,
        scope._ctx),

    execute: (node, scope, input) => runMethod(evaluate(node.execute, scope), methodScope(scope, input)),

    low: async (node, scope, input) => {
        if (!checkEffects(node.low, scope.self)) return null;
        const fn = await lowFunction(node.low);
        return Promise.resolve().then(() => fn({ input, _ctx: scope._ctx })).catch(foreign(node.low));
    }
};
