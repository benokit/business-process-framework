import { isFunction } from 'lodash-es';
import { validateSchema } from 'system/schema.js'

async function evaluate({ implementation, inputSchema }, input) {
    const { evaluate: fn } = await import(implementation);

    if (!fn) {
        throw 'missing implementation';
    }

    if (!isFunction(fn)) {
        throw 'implementation is not a function';
    }

    const inputValidation = validateSchema(inputSchema, input);

    if (!inputValidation.isValid) {
        throw 'not valid input: ' + JSON.stringify(inputValidation.errors)
    }

    return fn(input);
}

export {
    evaluate
};
