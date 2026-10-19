import { bind, checkBindings } from '../../context.js';
import { evaluate, runPipeline } from '../pipeline.js';

export const context = {
    withContext: (node, scope, input) => {
        const bindings = evaluate(node.withContext, scope);
        checkBindings(node, bindings);
        return runPipeline(node.do, { ...scope, input, _ctx: bind(scope._ctx, bindings) });
    }
};
