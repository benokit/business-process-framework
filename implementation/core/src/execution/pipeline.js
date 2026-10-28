import { compileMapping } from '../mappings.js';
import { fail, framing } from '../errors.js';
import { executors } from './nodes/index.js';
import { findTemplate, runTemplate } from './templates.js';
import { sequentially } from './sequentially.js';
import { ownerOf } from './owners.js';

export class Return {
    constructor(value) {
        this.value = value;
    }
}

const MODIFIERS = new Set(['inputMap', 'outputKey']);

export const evaluate = (tree, scope) => compileMapping(tree)(scope);

const executorOf = node => {
    const keys = Object.keys(node).filter(key => !MODIFIERS.has(key));
    const native = keys.find(key => key in executors);
    if (native) return executors[native];
    const template = keys.map(findTemplate).find(Boolean);
    if (template) return (node, scope, input) => runTemplate(template, node, scope, input);
    if (keys.length > 0) fail('unknown-keyword', `no node keyword among '${keys.join("', '")}'`, { keys });
    return (node, scope, input) => input;
};

const inputOf = (node, scope) => 'inputMap' in node ? evaluate(node.inputMap, scope) : scope.input;

const keywordOf = node => Object.keys(node).find(key => !MODIFIERS.has(key)) ?? 'input';

const runNode = (node, scope, index) => {
    const input = framing.around(() => inputOf(node, scope), 'step', index + 1, 'inputMap');
    return framing.around(() => executorOf(node)(node, scope, input), 'step', index + 1, () => keywordOf(node));
};

const withOutput = (scope, node, output) => {
    if (node.outputKey === '_ctx') fail('context-write', "outputKey '_ctx' is not allowed: bind context with withContext", { node });
    return node.outputKey === undefined ? scope : { ...scope, [node.outputKey]: output };
};

const runSequence = async (nodes, scope) => (await sequentially(nodes, async (node, state) => {
    const output = await runNode(node, state.scope, state.index);
    return { scope: withOutput(state.scope, node, output), output, index: state.index + 1 };
}, { scope, output: undefined, index: 0 })).output;

export const runPipeline = (pipeline, scope) => Array.isArray(pipeline)
    ? runSequence(pipeline, scope)
    : runNode(pipeline, scope, 0);

const runSignalled = async (pipeline, scope) => {
    try {
        return await runPipeline(pipeline, scope);
    } catch (signal) {
        if (signal instanceof Return) return signal.value;
        throw signal;
    }
};

export const runMethod = (pipeline, scope) => {
    const owner = ownerOf(pipeline);
    return owner === undefined ? runSignalled(pipeline, scope) : framing.around(() => runSignalled(pipeline, scope), owner);
};

export const methodScope = ({ self, _ctx }, input) => ({ input, self, _ctx });

export const execute = ({ method, input, self, _ctx }) => runMethod(method, { input, self, _ctx });
