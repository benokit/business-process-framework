const { isAsyncFunction } = require('system/validations');
const { isValidAgainstSchema } = require('system/schema');
const { getDefinition } = require('system/register');
const { getImplementation } = require('system/implementationsLoader');
const { isFunction, isPlainObject } = require('lodash');


function evaluate(instanceType, instanceId, input) {
    const instanceObject = getDefinition(instanceType, instanceId);
    return evaluateObject(instanceObject, input);
}

function evaluateObject(instanceObject, input) {
    if (!(instanceObject && isPlainObject(instanceObject))) {
        throw 'expecting object';
    }

    const typeDefinition = getDefinition('type', instanceObject.type);

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
        throw 'implementation is not a function';
    }

    if (isAsyncFunction(evaluate)) {
        throw 'implementation can not be asynchronous';
    }

    return evaluate(instanceObject, input);
}

module.exports = {
    evaluate,
    evaluateObject
}