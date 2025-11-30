import { concat, flatten, isPlainObject, isString, values, map } from 'lodash-es';
import { validateSchema } from 'core/schema';
import { compile } from 'lambdajson-js';
import { getData } from 'core/data';

const funkRegister = {};

const customPrimitives = {
    $evaluate: ({ _id, _input = ({input}) => input}) => x => funkRegister[_id(x)](_input(x))
};

async function evaluate({id, configuration: { implementation, input: inputSchema }}, input) {
    const fn = funkRegister[id] || (await registerFunction(id, implementation));

    const inputValidation = validateSchema(inputSchema, input);

    if (!inputValidation.isValid) {
        throw 'not valid input: ' + JSON.stringify(inputValidation.errors)
    }

    return fn(input);
}

async function registerFunction(id, implementation) {
    if (isString(implementation)) {
        const { evaluate } = await import(implementation);
        funkRegister[id] = evaluate;
    }
    else {
        const fn = compile(implementation, customPrimitives);
        funkRegister[id] = fn;
        await registerDependencies(implementation);
    } 

    return funkRegister[id];
}

async function registerDependencies(implementation) {
    const ids = getDependenciesIds(implementation);
    for (const id of ids) {
        if (!funkRegister[id]) {
            const instance = getData(id);
            if (!instance || !instance.meta.service === 'function');
            await registerFunction(id, instance.data.implementation)
        }
    }
}

function getDependenciesIds(p) {
    if (!isPlainObject(p)) {
        return []
    }
    return concat((p['$evaluate'] ? [p['$evaluate']['_id']] : []), flatten(map(values(p), getDependenciesIds)));
}

export {
    evaluate
};
