const { isAsyncFunction } = require('system/validations');
const { validateSchema } = require('system/schema');
const { getObject } = require('system/objects-registry');
const { getImplementation } = require('system/implementations-registry');
const { isFunction, isPlainObject, isArray } = require('lodash');
const { getInstanceOfClass } = require('system/instances-registry');

module.exports = {
    evaluate,
    execute,
    evaluateInstance,
    executeInstance
}

function evaluate(instanceType, instanceId, input) {
    const instance = getInstanceOfClass(instanceType, instanceId);
    return evaluateInstance(instance, input);
}

function evaluateInstance(instanceObject, input) {
    if (!(instanceObject && isPlainObject(instanceObject))) {
        throw 'expecting object';
    }

    const typeDefinition = getObject('class', instanceObject.type);

    if (!typeDefinition) {
        throw 'type is not defined';
    }

    if (!typeDefinition.evaluate) {
        throw 'type does not support evaluation';
    }

    const inputValidation = validateInputAgainstInterface(typeDefinition.execute.interface, input);
    if (!inputValidation.isValid) {
        throw 'input not valid input according to schema: ' + JSON.stringify(inputValidation.errors);
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

async function execute(instanceType, instanceId, request) {
    const instance = getInstanceOfClass(instanceType, instanceId);
    return await executeInstance(instance, request);
}

async function executeInstance(instanceObject, request) {
    if (!(instanceObject && isPlainObject(instanceObject))) {
        throw 'expecting object';
    }

    const typeDefinition = getObject('class', instanceObject.type);

    if (!typeDefinition) {
        throw 'type is not defined';
    }

    if (!typeDefinition.execute) {
        throw 'type does not support execution';
    }

    const requestValidation = validateRequestAgainstInterface(typeDefinition.execute.interface, request);
    if (!requestValidation.isValid) {
        throw 'request not valid input according to schema: ' + JSON.stringify(requestValidation.errors);
    }

    const execute = getImplementation(typeDefinition.execute.implementation);

    if (!execute) {
        throw 'missing implementation';
    }

    if (!isFunction(execute)) {
        throw 'implementation is not a function';
    }

    return await execute(instanceObject, request);
}

function validateInputAgainstInterface(interface, input) {
    if (isArray(interface)) {
        const schema = {
            oneOf: interface.map(i => i.inputSchema || {})
        }
        return validateSchema(schema, input)
    }
    return validateSchema(interface.inputSchema || {}, input)
}

function validateRequestAgainstInterface(interface, request) {
    if (isArray(interface)) {
        const schema = {
            oneOf: interface.map(i => i.requestSchema || {})
        }
        return validateSchema(schema, request)
    }
    return validateSchema(interface.requestSchema || {}, request)
}
