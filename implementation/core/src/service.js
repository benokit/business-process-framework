import { validateSchema } from './schema.js';
import { getData, getDataOfKind, getServicesOfKind } from './data.js';
import { getElement } from './elements-registry.js';
import { getPureFunctionPrimitives } from './pure-functions.js';
import { has, isArray, isPlainObject, merge } from 'lodash-es';
import { compile } from 'lambdajson-js';

export {
    execute,
    executeMethod
};

async function execute(serviceId, methodName, input, _ctx = {}) {
    const isRoot = !_ctx._execution;
    try {
        const service = getElement('service', serviceId);
        const iface = getData(service.interface);
        validateInputAgainstInterface(iface.data[methodName], input);
        const impl = getData(service.implementation).data[methodName];
        return await executeMethod(impl, input, _ctx);
    } catch (e) {
        if (!isRoot) throw e;
        if (e && e._isExecutionDiagnostic) {
            e.service = serviceId;
            e.method = methodName;
            throw e;
        }
        const execution = _ctx._execution;
        throw {
            _isExecutionDiagnostic: true,
            service: serviceId,
            method: methodName,
            trace: execution ? [...execution.trace] : [],
            node: execution?.current?.node ?? null,
            phase: execution?.current?.phase ?? null,
            cause: e
        };
    }
}

function validateInputAgainstInterface(methodInterface, input) {
    const inputValidation = validateSchema(methodInterface.input || {}, input)
     if (!inputValidation.isValid) {
        throw 'input is not valid: ' + JSON.stringify(inputValidation.errors);
    }
}

const keyword = {
    service: 'service',
    low: 'low',
    execute: 'execute',
    set: 'set',
    if: 'if',
    return: 'return',
    forEach: 'forEach',
    switch: 'switch',
    try: 'try',
    catch: 'catch',
    finally: 'finally',
    throw: 'throw',
    validateSchema: 'validateSchema',
    inputMap: 'inputMap',
    outputMap: 'outputMap',
    default: 'default',
    getData: 'getData',
    getDataOfKind: 'getDataOfKind',
    getServicesOfKind: 'getServicesOfKind',
    executeRef: 'executeRef'
};

async function executeMethod(implementation, input, _ctx = {}) {
    if (!_ctx.timestampUTC) _ctx.timestampUTC = new Date().toISOString();
    const isRoot = !_ctx._execution;
    if (!_ctx._execution) _ctx._execution = { trace: [] };
    const traceStart = _ctx._execution.trace.length;
    const context = { _ctx, input };
    try {
        const result = await executeMethodWithContext(implementation, context);
        _ctx._execution.trace.splice(traceStart);
        return result;
    } catch (e) {
        if (!isRoot || (e && e._isExecutionDiagnostic)) throw e;
        const execution = _ctx._execution;
        throw {
            _isExecutionDiagnostic: true,
            trace: [...execution.trace],
            node: execution.current?.node ?? null,
            phase: execution.current?.phase ?? null,
            cause: e
        };
    }
}

async function executeMethodWithContext(implementation, context) {
    if (!isArray(implementation)) {
        return await executeNode(implementation, context);
    }

    for (const node of implementation.slice(0, -1)) {
        const output = await executeNode(node, context);
        if (node.name) {
            if (has(node, keyword.set) && isPlainObject(context[node.name]) && isPlainObject(output)) {
                merge(context[node.name], output);
            } else {
                context[node.name] = output;
            }
        }
    }

    const lastNode = implementation.at(-1);
    return await executeNode(lastNode, context);
}

async function executeNode(node, context) {
    const execution = context._ctx?._execution;
    execution?.trace?.push(nodeLabel(node));

    let nodeInput;
    if (has(node, keyword.inputMap)) {
        if (execution) execution.current = { node, phase: 'inputMap' };
        nodeInput = { _ctx: context._ctx, input: await executeMapping(node.inputMap, context) };
    } else {
        nodeInput = context;
    }

    if (execution) execution.current = { node, phase: 'execute' };
    let result;
    if (has(node, keyword.execute)) {
        const pipeline = await executeMapping(node.execute, context);
        result = await executeMethodWithContext(pipeline, nodeInput);
    } else if (has(node, keyword.executeRef)) {
        const id = await executeMapping(node.executeRef, context);
        const pipeline = getData(id).data;
        result = await executeMethodWithContext(pipeline, nodeInput);
    } else {
        const exec = await resolveNodeExecutor(node);
        result = await exec(nodeInput);
    }

    if (has(node, keyword.outputMap)) {
        if (execution) execution.current = { node, phase: 'outputMap' };
        return await executeMapping(node.outputMap, result);
    }
    return result;
}

async function resolveNodeExecutor(node) {
    if (has(node, keyword.service)) {
        return async ({ _ctx, input }) => await execute(node.service.id, node.service.method, input, _ctx);
    }

    if (has(node, keyword.low)) {
        const g = (await import(node.low.module))[node.low.functionName];
        return async input => await g(input)
    }

    if (has(node, keyword.return)) {
        return async input => await executeMapping(node.return, input);
    }

    if (has(node, keyword.set)) {
        return async input => await executeMapping(node.set, input);
    }

    if (has(node, keyword.if)) {
        return async input => {
            const condition = await executeMapping(node.if, input);
            if (condition) {
                return await executeMethodWithContext(node.then, input);
            } else {
                return node.else != null ? await executeMethodWithContext(node.else, input) : null;
            }
        }
    }

    if (has(node, keyword.forEach)) {
        return async ({ _ctx, input }) => {
            const result = [];
            for (const x of input) {
                result.push(await executeMethod(node.forEach, x, _ctx));
            }
            return result;
        }
    }

    if (has(node, keyword.try)) {
        return async input => {
            try {
                try {
                    return await executeMethodWithContext(node.try, input);
                } catch (error) {
                    if (!has(node, keyword.catch)) throw error;
                    return await executeMethodWithContext(node.catch, { _ctx: input._ctx, context: input, error });
                }
            } finally {
                if (has(node, keyword.finally)) {
                    await executeMethodWithContext(node.finally, input);
                }
            }
        }
    }

    if (has(node, keyword.throw)) {
        return async input => {
            const error = await executeMapping(node.throw, input);
            throw error;
        }
    }

    if (has(node, keyword.validateSchema)) {
        return async ({ input }) => {
            const result = validateSchema(node.validateSchema, input);
            if (!result.isValid) {
                throw 'validation failed: ' + JSON.stringify(result.errors);
            }
            return input;
        }
    }

    if (has(node, keyword.getData)) {
        return async input => {
            const id = await executeMapping(node[keyword.getData], input);
            return getData(id);
        }
    }

    if (has(node, keyword.getDataOfKind)) {
        return async input => {
            const kind = await executeMapping(node[keyword.getDataOfKind], input);
            return getDataOfKind(kind);
        }
    }

    if (has(node, keyword.getServicesOfKind)) {
        return async input => {
            const kind = await executeMapping(node[keyword.getServicesOfKind], input);
            return getServicesOfKind(kind);
        }
    }

    if (has(node, keyword.switch)) {
        return async input => {
            const value = await executeMapping(node.switch.value, input);
            const g = node.switch.cases[value] || node.switch.cases[keyword.default];
            return await executeMethodWithContext(g, input);
        }
    }

    const templates = getDataOfKind('execution-node-template').items;
    for (const template of templates) {
        const { keyword: kw, implementation } = template.data;
        if (has(node, kw)) {
            return async ({ _ctx, input }) => await executeMethodWithContext(implementation, { _ctx, input, node });
        }
    }
}

function nodeLabel(node) {
    if (has(node, keyword.service)) return `${node.service.id}/${node.service.method}`;
    if (node.name) return node.name;
    for (const kw of Object.values(keyword)) {
        if (has(node, kw)) return kw;
    }
    return 'unknown';
}

async function executeMapping(func, input) {
    const f = await compileMapping(func);
    return f(input);
}

async function compileMapping(func) {
    const customPrimitives = await getCustomPrimitives(func);

    let lambda = func;

    if (has(func, '$low')) {
        lambda = { ...func };
        delete lambda.$low;
    }

    return compile(lambda, customPrimitives);
}

async function getCustomPrimitives(func) {
    const primitives = { ...getPureFunctionPrimitives() };

    if (!has(func, '$low')) {
        return primitives;
    }

    for (const name in func.$low) {
        primitives[name] = await getPrimitive(func.$low[name]);
    }

    return primitives;
}

async function getPrimitive({module, functionName}) {
    const g = (await import(module))[functionName];
    return f => x => g(f(x));
}
