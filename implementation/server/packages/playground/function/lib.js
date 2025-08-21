const { isAsyncFunction } = require('system/validations');
const { isFunction } = require('lodash');
const { validateSchema } = require('system/schema');
const { getImplementation } = require('system/implementations-loader');

function evaluate(functionInstance, input) {
    if(!validateSchema(functionInstance.configuration.inputSchema, input)) {
        throw 'not valid input according to schema';
    }

    const fn = getImplementation(functionInstance.configuration.implementation);

    if (!fn) {
        throw 'missing implementation';
    }

    if (!isFunction(fn)) {
        throw 'implementation is not a function';
    }

    if (isAsyncFunction(fn)) {
        throw 'implementation can not be asynchronous';
    }

    return fn(input);
}

module.exports = {
    evaluate
}