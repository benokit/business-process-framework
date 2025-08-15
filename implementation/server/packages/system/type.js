const { isFunction, isAsyncFunction } = require('system/validations');
const { isValidAgainstSchema } = require('system/schema');
const { getDefinition } = require('system/register');
const { getImplementation } = require('system/implementationsLoader');

function evaluate(typeInstance, input) {
    const typeDefinition = getDefinition('type', typeInstance.type);

    if (!typeDefinition) {
        throw 'type is not defined';
    }

    if (!typeDefinition.evaluate) {
        throw 'type does not support evaluation';
    }

    if (!isValidAgainstSchema(typeDefinition.evaluate.inputSchema, input)) {
        throw 'not valid input according to schema';
    }

    const evaluate = getImplementation(typeDefinition.evaluate.implementation);

    if (!evaluate) {
        throw 'missing implementation';
    }

    if (!isFunction(evaluate)) {
        throw 'evaluation is not a function';
    }

    if (isAsyncFunction(evaluate)) {
        throw 'evaluation can not be asynchronous';
    }

    return evaluate(typeInstance, input);
}

module.exports = {
    evaluate
}