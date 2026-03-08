import { validateSchema } from './schema.js';
import { getData, getDataOfKind } from './data.js';
import { getElement } from './elements-registry.js';
import { has, isArray, isPlainObject, merge } from 'lodash-es';
import { compile } from 'lambdajson-js';

export {
    execute
};

async function execute(serviceId, methodName, input, _ctx = {}) {
    const service = getElement('service', serviceId)
    const iface = getData(service.interface);
    validateInputAgainstInterface(iface.data[methodName], input);
    const impl = getData(service.implementation).data[methodName];
    return await executeMethod(impl, input, _ctx);
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
    inputMap: 'inputMap',
    outputMap: 'outputMap',
    dynamic: 'dynamic',
    default: 'default'
};

async function executeMethod(implementation, input, _ctx = {}) {
    const context = {
        _ctx,
        input
    };
    return await executeMethodWithContext(implementation, context);
}

async function executeMethodWithContext(implementation, context) {
    if (!isArray(implementation)) {
        return await executeItem(implementation, context);
    }

    for (const item of implementation.slice(0, -1)) {
        const output = await executeItem(item, context);
        if (item.name) {
            if (has(item, keyword.set) && isPlainObject(context[item.name]) && isPlainObject(output)) {
                merge(context[item.name], output);
            } else {
                context[item.name] = output;
            }
        }
    }

    const lastItem = implementation.at(-1);
    return await executeItem(lastItem, context);
}

async function executeItem(item, context) {
    let staticItem = item;
    if (has(item, keyword.dynamic)) {
        const dynamicPart = await executeMapping(item.dynamic, context);
        const { [keyword.dynamic]: _, ...rest } = item;
        staticItem = { ...rest, ...dynamicPart };
    }

    const nodeInput = has(staticItem, keyword.inputMap)
        ? { _ctx: context._ctx, input: await executeMapping(staticItem.inputMap, context) }
        : context;
    const exec = await resolveItemExecutor(staticItem);
    const result = await exec(nodeInput);
    const output = has(staticItem, keyword.outputMap) ? (await executeMapping(staticItem.outputMap, result)) : result;
    return output;
}

async function resolveItemExecutor(item) {
    if (has(item, keyword.service)) {
        return async ({ _ctx, input }) => await execute(item.service.id, item.service.method, input, _ctx);
    }

    if (has(item, keyword.execute)) {
        return async input => await executeMethodWithContext(item.execute, input);
    }

    if (has(item, keyword.low)) {
        const g = (await import(item.low.module))[item.low.functionName];
        return async input => await g(input)
    }

    if (has(item, keyword.return)) {
        return async input => await executeMapping(item.return, input);
    }

    if (has(item, keyword.set)) {
        return async input => await executeMapping(item.set, input);
    }

    if (has(item, keyword.if)) {
        return async input => {
            const condition = await executeMapping(item.if, input);
            if (condition) {
                return await executeMethodWithContext(item.then, input);
            } else {
                return await executeMethodWithContext(item.else, input);
            }
        }
    }

    if (has(item, keyword.forEach)) {
        return async ({ _ctx, input }) => {
            const result = [];
            for (const x of input) {
                result.push(await executeMethod(item.forEach, x, _ctx));
            }
            return result;
        }
    }

    if (has(item, keyword.try)) {
        return async input => {
            try {
                try {
                    return await executeMethodWithContext(item.try, input);
                } catch (error) {
                    if (!has(item, keyword.catch)) throw error;
                    return await executeMethodWithContext(item.catch, { _ctx: input._ctx, context: input, error });
                }
            } finally {
                if (has(item, keyword.finally)) {
                    await executeMethodWithContext(item.finally, input);
                }
            }
        }
    }

    if (has(item, keyword.throw)) {
        return async input => {
            const error = await executeMapping(item.throw, input); 
            throw error; 
        }
    }

    if (has(item, keyword.switch)) {
        return async input => {
            const value = await executeMapping(item.switch.value, input);
            const g = item.switch.cases[value] || item.switch.cases[keyword.default];
            return await executeMethodWithContext(g, input);
        }
    }

    const templates = getDataOfKind('execution-node-template').items;
    for (const template of templates) {
        const { keyword: kw, implementation } = template.data;
        if (has(item, kw)) {
            return async ({ _ctx, input }) => await executeMethodWithContext(implementation, { _ctx, input, node: item });
        }
    }
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
    const primitives = {}
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
