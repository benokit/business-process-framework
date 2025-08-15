const { isFunction, isAsyncFunction } = require('system/validations');
const { isValidAgainstSchema } = require('system/schema');
const { getImplementation } = require('system/implementationsLoader');

function evaluate(functionInstance, input) {
    if(!isValidAgainstSchema(functionInstance.configuration.inputSchema, input)) {
        throw 'not valid input according to schema';
    }

    const fn = getImplementation(functionInstance.configuration.implementation);

    if (!fn) {
        throw 'missing implementation';
    }

    if (!isFunction(fn)) {
        throw 'evaluation is not a function';
    }

    if (isAsyncFunction(fn)) {
        throw 'evaluation can not be asynchronous';
    }

    return fn(input);
}

module.exports = {
    evaluate
}