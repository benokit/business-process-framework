import { execute, executeMethod, executeMethodWithContext, executeMapping } from './service.js';
import { validateSchema } from './schema.js';
import { getData, getDataOfKind, getServicesOfKind } from './data.js';
import { has } from 'lodash-es';

// Dictionary mapping execution keyword -> (node) => async executorFn.
// Iterated over node properties to find the first matching executor.
// 'execution-node-template' entries are added via registerExecutionNodeTemplate (service.js).
export const executors = {

    service: node => async ({ _ctx, input }) =>
        await execute(node.service.id, node.service.method, input, _ctx),

    low: node => async input => {
        const g = (await import(node.low.module))[node.low.functionName];
        return await g(input);
    },

    return: node => async input =>
        await executeMapping(node.return, input),

    set: node => async input =>
        await executeMapping(node.set, input),

    if: node => async input => {
        const condition = await executeMapping(node.if, input);
        if (condition) {
            return await executeMethodWithContext(node.then, input);
        } else {
            return node.else != null ? await executeMethodWithContext(node.else, input) : null;
        }
    },

    forEach: node => async ({ _ctx, input }) => {
        const result = [];
        for (const x of input) {
            result.push(await executeMethod(node.forEach, x, _ctx));
        }
        return result;
    },

    try: node => async input => {
        try {
            try {
                return await executeMethodWithContext(node.try, input);
            } catch (error) {
                if (!has(node, 'catch')) throw error;
                return await executeMethodWithContext(node.catch, { _ctx: input._ctx, context: input, error });
            }
        } finally {
            if (has(node, 'finally')) {
                await executeMethodWithContext(node.finally, input);
            }
        }
    },

    throw: node => async input => {
        const error = await executeMapping(node.throw, input);
        throw error;
    },

    validateSchema: node => async ({ input }) => {
        const result = validateSchema(node.validateSchema, input);
        if (!result.isValid) {
            throw 'validation failed: ' + JSON.stringify(result.errors);
        }
        return input;
    },

    getData: node => async input => {
        const id = await executeMapping(node.getData, input);
        return getData(id);
    },

    getDataOfKind: node => async input => {
        const kind = await executeMapping(node.getDataOfKind, input);
        return getDataOfKind(kind);
    },

    getServicesOfKind: node => async input => {
        const kind = await executeMapping(node.getServicesOfKind, input);
        return getServicesOfKind(kind);
    },

    switch: node => async input => {
        const value = await executeMapping(node.switch.value, input);
        const g = node.switch.cases[value] || node.switch.cases['default'];
        return await executeMethodWithContext(g, input);
    }

};
