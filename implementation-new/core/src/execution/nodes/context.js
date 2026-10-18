import { bind, checkBindings } from '../../context.js';
import { evaluate, runPipeline } from '../pipeline.js';

export const context = {
    withContext: (node, scope) => {
        const bindings = evaluate(node.withContext, scope, node);
        checkBindings(node, bindings);
        return runPipeline(node.do, { ...scope, _ctx: bind(scope._ctx, bindings) });
    }
};
