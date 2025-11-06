import { isFunction } from 'lodash-es';
import { validateSchema } from 'system/schema.js'

async function evaluate(functionInstance, input) {
    const { evaluate: fn } = await import(functionInstance.configuration.implementation);

    if (!fn) {
        throw 'missing implementation';
    }

    if (!isFunction(fn)) {
        throw 'implementation is not a function';
    }

    const inputValidation = validateSchema(functionInstance.configuration.inputSchema, input);

    if (!inputValidation.isValid) {
        throw 'not valid input: ' + JSON.stringify(inputValidation.errors)
    }

    return fn(input);
}

export {
    evaluate
};
