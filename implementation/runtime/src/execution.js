import { validateSchema } from './schema.js';
import { getElement } from './elements-registry.js';
import { getPureFunctionPrimitives } from './pure-functions.js';
import { filter, has, isArray, isPlainObject, isString, keys, merge, map, join } from 'lodash-es';
import { compile } from 'lambdajson-js';
import { executors } from './executors.js';

export {
    executeService,
    executeMethod,
    executeMethodWithContext,
    executeMapping,
    registerExecutionNodeTemplate,
    PipelineReturn,
    ExitExecution
};

class PipelineReturn {
    constructor(value) { this.value = value; }
}

class ExitExecution {
    constructor(value) { this.value = value; }
}

function makeDiagnostic(cause, execution, extra = {}) {
    return {
        _isExecutionDiagnostic: true,
        ...extra,
        trace: execution ? [...execution.trace] : [],
        node: execution?.current?.node ?? null,
        phase: execution?.current?.phase ?? null,
        cause
    };
}

async function executeService(serviceId, methodId, input, _ctx = {}) {
    const isRoot = !_ctx._execution;
    try {
        const service = getElement(serviceId).data;
        validateInputAgainstInterface(service.interface[methodId], input);
        return await executeMethod(service.implementation[methodId], input, _ctx);
    } catch (e) {
        if (!isRoot) throw e;
        if (e && e._isExecutionDiagnostic) {
            e.service = serviceId;
            e.method = methodId;
            throw e;
        }
        throw makeDiagnostic(e, _ctx._execution, { service: serviceId, method: methodId });
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
        if (e instanceof PipelineReturn) return e.value;
        if (e instanceof ExitExecution) {
            if (isRoot) return e.value;
            throw e;
        }
        if (!isRoot || (e && e._isExecutionDiagnostic)) throw e;
        throw makeDiagnostic(e, _ctx._execution);
    }
}

async function executeMethodWithContext(implementation, context) {
    if (!isArray(implementation)) {
        return await executeNode(implementation, context);
    }

    let result;
    try {
        for (const node of implementation) {
            const output = await executeNode(node, context);
            if (node.outputKey) {
                if (has(node, keyword.set) && isPlainObject(context[node.outputKey]) && isPlainObject(output)) {
                    merge(context[node.outputKey], output);
                } else {
                    context[node.outputKey] = output;
                }
            }
            result = output;
        }
    } catch (e) {
        if (e instanceof PipelineReturn) return e.value;
        throw e;
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
    let executorRan = false;
    for (const key of Object.keys(node)) {
        if (executors[key]) {
            result = await executors[key](node)(nodeInput, context);
            executorRan = true;
            break;
        }
    }

    if (!executorRan) {
        result = has(node, keyword.inputMap) ? nodeInput.input : context;
    }

    if (has(node, keyword.outputMap)) {
        if (execution) execution.current = { node, phase: 'outputMap' };
        return await executeMapping(node.outputMap, result);
    }
    return result;
}

function nodeLabel(node) {
    return join(map(filter(keys(node),
        k => ![keyword.inputMap, keyword.outputMap].includes(k)),
        k => `${k}:${isString(node[k]) ? node[k] : '{}'}`),
        '|');
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
