import { compileMapping } from '../mappings.js';
import { visibleContext } from '../context.js';
import { fail } from '../errors.js';
import { executors } from './nodes/index.js';
import { findTemplate, runTemplate } from './templates.js';
import { sequentially } from './sequentially.js';

export class Return {
    constructor(value) {
        this.value = value;
    }
}

const MODIFIERS = new Set(['inputMap', 'outputKey']);

export const evaluate = (tree, scope, node) => compileMapping(tree)({ ...scope, _ctx: visibleContext(node, scope._ctx) });

const executorOf = node => {
    const keys = Object.keys(node).filter(key => !MODIFIERS.has(key));
    const native = keys.find(key => key in executors);
    if (native) return executors[native];
    const template = keys.map(findTemplate).find(Boolean);
    if (template) return (node, scope) => runTemplate(template, node, scope);
    if (keys.length > 0) fail('unknown-keyword', `no node keyword among '${keys.join("', '")}'`, { keys });
    return (node, scope) => scope.input;
};

const runNode = (node, scope) => executorOf(node)(node, 'inputMap' in node
    ? { ...scope, input: evaluate(node.inputMap, scope, node) }
    : scope);

const withOutput = (scope, node, output) => {
    if (node.outputKey === '_ctx') fail('context-write', "outputKey '_ctx' is not allowed: bind context with withContext", { node });
    return node.outputKey === undefined ? scope : { ...scope, [node.outputKey]: output };
};

const runSequence = async (nodes, scope) => (await sequentially(nodes, async (node, state) => {
    const output = await runNode(node, state.scope);
    return { scope: withOutput(state.scope, node, output), output };
}, { scope, output: undefined })).output;

export const runPipeline = (pipeline, scope) => Array.isArray(pipeline)
    ? runSequence(pipeline, scope)
    : runNode(pipeline, scope);

export const runMethod = async (pipeline, scope) => {
    try {
        return await runPipeline(pipeline, scope);
    } catch (signal) {
        if (signal instanceof Return) return signal.value;
        throw signal;
    }
};

export const methodScope = ({ input, self, _ctx }) => ({ input, self, _ctx });
