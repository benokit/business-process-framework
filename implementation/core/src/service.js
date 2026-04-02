import { validateSchema } from './schema.js';
import { getElement } from './elements-registry.js';
import { getPureFunctionPrimitives } from './pure-functions.js';
import { has, isArray, isPlainObject, isString, merge } from 'lodash-es';
import { compile } from 'lambdajson-js';
import { executors } from './executors.js';

export {
    execute,
    executeMethod,
    executeMethodWithContext,
    executeMapping,
    registerExecutionNodeTemplate
};

async function execute(serviceId, methodName, input, _ctx = {}) {
    const isRoot = !_ctx._execution;
    try {
        const service = getElement(serviceId).data;
        const iface = isString(service.interface) ? getElement(service.interface).data : service.interface;
        validateInputAgainstInterface(iface[methodName], input);
        const impl = isString(service.implementation) ? getElement(service.implementation).data : service.implementation;
        return await executeMethod(impl[methodName], input, _ctx);
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
    execute: 'execute',
    executeRef: 'executeRef',
    inputMap: 'inputMap',
    outputMap: 'outputMap',
    set: 'set'
};

function registerExecutionNodeTemplate(kw, implementation) {
    executors[kw] = node => async ({ _ctx, input }) =>
        await executeMethodWithContext(implementation, { _ctx, input, node });
}

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

    let result;
    for (const node of implementation) {
        const output = await executeNode(node, context);
        if (node.name) {
            if (has(node, keyword.set) && isPlainObject(context[node.name]) && isPlainObject(output)) {
                merge(context[node.name], output);
            } else {
                context[node.name] = output;
            }
        }
        result = output;
    }
    return result;
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
        const pipeline = getElement(id).data;
        result = await executeMethodWithContext(pipeline, nodeInput);
    } else {
        for (const key of Object.keys(node)) {
            if (executors[key]) {
                result = await executors[key](node)(nodeInput);
                break;
            }
        }
    }

    if (has(node, keyword.outputMap)) {
        if (execution) execution.current = { node, phase: 'outputMap' };
        return await executeMapping(node.outputMap, result);
    }
    return result;
}

function nodeLabel(node) {
    if (has(node, keyword.service)) return `${node.service.id}/${node.service.method}`;
    if (node.name) return node.name;
    for (const kw of [...Object.keys(executors), keyword.execute, keyword.executeRef]) {
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
