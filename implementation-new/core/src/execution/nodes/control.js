import { evaluate, runPipeline, Return } from '../pipeline.js';
import { mapSequentially } from '../sequentially.js';

const runOptional = (pipeline, scope) => pipeline === undefined ? null : runPipeline(pipeline, scope);

const runTry = async (node, scope) => {
    try {
        return await runPipeline(node.try, scope);
    } catch (error) {
        if (error instanceof Return || node.catch === undefined) throw error;
        return await runPipeline(node.catch, { ...scope, error });
    } finally {
        await runOptional(node.finally, scope);
    }
};

export const control = {
    set: (node, scope) => evaluate(node.set, scope, node),

    if: (node, scope) => evaluate(node.if, scope, node)
        ? runPipeline(node.then, scope)
        : runOptional(node.else, scope),

    switch: (node, scope) => {
        const { value, cases } = node.switch;
        return runOptional(cases[evaluate(value, scope, node)] ?? cases.default, scope);
    },

    forEach: (node, scope) => mapSequentially(scope.input ?? [], item => runPipeline(node.forEach, { ...scope, input: item })),

    try: runTry,

    throw: (node, scope) => {
        throw evaluate(node.throw, scope, node);
    },

    return: (node, scope) => {
        throw new Return(evaluate(node.return, scope, node));
    }
};
