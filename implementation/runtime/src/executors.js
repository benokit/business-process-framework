import { executeService, executeMethod, executeMethodWithContext, executeMapping, PipelineReturn, ExitExecution } from './execution.js';
import { validateSchema, resolveSchema } from './schema.js';
import { has } from 'lodash-es';
import { getElement, getElementsOfKind } from './elements-registry.js';
import { randomUUID } from 'crypto';

// Dictionary mapping execution keyword -> (node) => async executorFn.
// Iterated over node properties to find the first matching executor.
// 'execution-node-template' entries are added via registerExecutionNodeTemplate (service.js).
export const executors = {

    service: node => async ({ _ctx, input }) =>
        await executeService(node.service, node.method, input, _ctx),

    call: node => async ({ _ctx, input }) => {
        const impl = getElement(node.call).data;
        return await executeMethod(impl, input, _ctx);
    },

    execute: node => async (nodeInput, context) => {
        const impl = await executeMapping(node.execute, context ?? nodeInput);
        try {
            return await executeMethodWithContext(impl, nodeInput);
        } catch (e) {
            if (e instanceof PipelineReturn) return e.value;
            throw e;
        }
    },

    low: node => async input => {
        const g = (await import(node.low.module))[node.low.functionName];
        return await g(input);
    },

    return: node => async input => {
        const value = await executeMapping(node.return, input);
        throw new PipelineReturn(value);
    },

    exit: node => async input => {
        const value = await executeMapping(node.exit, input);
        throw new ExitExecution(value);
    },

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

    forEach: node => async (nodeInput, context) => {
        const outerContext = context ?? nodeInput;
        const result = [];
        for (const x of nodeInput.input) {
            let value;
            try {
                value = await executeMethodWithContext(node.forEach, { ...outerContext, input: x });
            } catch (e) {
                if (e instanceof PipelineReturn) { value = e.value; }
                else throw e;
            }
            result.push(value);
        }
        return result;
    },

    try: node => async input => {
        try {
            try {
                return await executeMethodWithContext(node.try, input);
            } catch (error) {
                if (error instanceof PipelineReturn) throw error;
                if (error instanceof ExitExecution) throw error;
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

    getElement: node => async input => {
        const id = await executeMapping(node.getElement, input);
        return getElement(id);
    },

    getElementsOfKind: node => async input => {
        const kind = await executeMapping(node.getElementsOfKind, input);
        return getElementsOfKind(kind);
    },

    getElementsOfKindHierarchy: node => async input => {
        const { _prefix, _hierarchy } = await executeMapping(node.getElementsOfKindHierarchy, input);
        if (!_hierarchy) return { items: [] };
        const segments = _hierarchy.split('/');
        const items = segments.flatMap((_, i) =>
            getElementsOfKind(_prefix + segments.slice(0, i + 1).join('/')).items
        );
        return { items };
    },

    switch: node => async input => {
        const value = await executeMapping(node.switch.value, input);
        const g = node.switch.cases[value] || node.switch.cases['default'];
        return await executeMethodWithContext(g, input);
    },

    getRandom: _ => _ => randomUUID(),

    resolveSchema: node => async ({ input }) =>
        resolveSchema(node.resolveSchema ?? input)

};
