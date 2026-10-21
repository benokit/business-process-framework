import { CoreError } from '../../errors.js';
import { evaluate, runPipeline, Return } from '../pipeline.js';
import { mapSequentially } from '../sequentially.js';

const runOptional = (pipeline, scope) => pipeline === undefined ? null : runPipeline(pipeline, scope);

const runTry = async (node, scope, input) => {
    const inner = { ...scope, input };
    try {
        return await runPipeline(node.try, inner);
    } catch (error) {
        if (error instanceof Return || node.catch === undefined) throw error;
        return await runPipeline(node.catch, { ...inner, error });
    } finally {
        await runOptional(node.finally, inner);
    }
};

const errorOf = value => value instanceof CoreError
    ? value
    : typeof value === 'object' && value !== null
        ? new CoreError(value.code ?? 'error', value.message ?? '', value.data ?? {})
        : new CoreError('error', String(value), {});

export const control = {
    set: (node, scope) => evaluate(node.set, scope),

    if: (node, scope, input) => evaluate(node.if, scope)
        ? runPipeline(node.then, { ...scope, input })
        : runOptional(node.else, { ...scope, input }),

    switch: (node, scope, input) => {
        const { value, cases } = node.switch;
        return runOptional(cases[evaluate(value, scope)] ?? cases.default, { ...scope, input });
    },

    forEach: (node, scope, input) => mapSequentially(input ?? [], item => runPipeline(node.forEach, { ...scope, item })),

    try: runTry,

    throw: (node, scope) => {
        throw errorOf(evaluate(node.throw, scope));
    },

    return: (node, scope) => {
        throw new Return(evaluate(node.return, scope));
    }
};
