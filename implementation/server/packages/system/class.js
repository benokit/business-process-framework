const { isAsyncFunction } = require('system/validations');
const { validateSchema } = require('system/schema');
const { getObjectFromRegister } = require('system/register');
const { getImplementation } = require('system/implementations-loader');
const { isFunction, isPlainObject, isArray } = require('lodash');
const { evaluateData } = require('system/data');

const instanceCache = {};

function getInstanceCacheKey(instanceType, instanceId) {
    return instanceId + '@' + instanceType;
}

function getInstance(instanceType, instanceId) {
    const instanceKey = getInstanceCacheKey(instanceType, instanceId);
    
    if (instanceCache[instanceKey]) {
        return instanceCache[instanceKey];
    }

    const instanceDefinition = getObjectFromRegister(instanceType, instanceId);

    instanceCache[instanceKey] = {
        ...instanceDefinition,
        configuration: evaluateData(instanceDefinition.configuration)
    };

    return instanceCache[instanceKey];
}

function evaluate(instanceType, instanceId, input) {
    const instance = getInstance(instanceType, instanceId);
    return evaluateObject(instance, input);
}

function evaluateObject(instanceObject, input) {
    if (!(instanceObject && isPlainObject(instanceObject))) {
        throw 'expecting object';
    }

    const typeDefinition = getObjectFromRegister('class', instanceObject.type);

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
    const instance = getInstance(instanceType, instanceId);
    return await executeObject(instance, request);
}

async function executeObject(instanceObject, request) {
    if (!(instanceObject && isPlainObject(instanceObject))) {
        throw 'expecting object';
    }

    const typeDefinition = getObjectFromRegister('class', instanceObject.type);

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

module.exports = {
    evaluate,
    execute
}