import { validateSchema } from './schema.js';
import { getData } from './data.js';
import { has, isArray } from 'lodash-es';
import { compile } from 'lambdajson-js';

export {
    execute
};

async function execute(serviceId, methodName, input) {
    const iface = getData('iface@' + serviceId);
    validateInputAgainstInterface(iface[methodName], input);
    const impl = getData('impl@' + serviceId)[methodName];
    return await executeMethod(impl, input);
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
    set: 'set',
    if: 'if',
    return: 'return',
    forEach: 'forEach',
    switch: 'switch',
    try: 'try',
    throw: 'throw',
    inputMap: 'inputMap',
    outputMap: 'outputMap',
    default: 'default'
};

async function executeMethod(implementation, input) {
    const context = {
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
            context[item.name] = output;
        }
    }

    const lastItem = implementation.at(-1);
    return await executeItem(lastItem, context);
}

async function executeItem(item, context) {
    const input = has(item, keyword.inputMap) ? (await executeMapping(item.inputMap, context)) : context;
    const exec = await resolveItemExecutor(item);
    const result = await exec(input);
    const output = has(item, keyword.outputMap) ? (await executeMapping(item.outputMap, result)) : result;
    return output;
}

async function resolveItemExecutor(item) {
    if (has(item, keyword.service)) {
        return async input => await execute(item.service.id, item.service.method, input);
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
        return async input => {
            const result = [];
            for (const x of input) {
                result.push(await executeMethod(item.forEach, x));
            }
            return result;
        }
    }

    if (has(item, keyword.try)) {
        return async input => {
            try {
                return await executeMethodWithContext(item.try, input);
            }
            catch (error) {
                return await executeMethodWithContext(item.catch, {context: input, error});
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
}

async function executeMapping(func, input) {
    const f = await compileMapping(func);
    return f(input);
}

async function compileMapping(func) {
    const customPrimitives = await getCustomPrimitives(func);

    const pureFunc = { ...func };
    delete pureFunc.$low;

    return compile(pureFunc, customPrimitives);
} 

async function getCustomPrimitives(func) {
    const primitives = {}
    if (!func.$low) {
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
