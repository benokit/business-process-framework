const objectsRegister = { };

function isValidAgainstSchema(schema, object) {
    return true;
}

function getObject(objectId) {
    return objectsRegister[objectId];
}

function isFunction(fn) {
  return typeof fn === 'function';
}

function isAsyncFunction(fn) {
  return typeof fn === 'function' && fn.constructor.name === 'AsyncFunction';
}

function getTypeDefinition(typeId) {
    return objectsRegister.type[typeId];
}

function evaluate(typeInstance, input) {
    const typeDefinition = getTypeDefinition(typeInstance.type);

    if (!typeDefinition) {
        throw 'type is not defined';
    }

    if (!typeDefinition.evaluate) {
        throw 'type does not support evaluation';
    }

    if (!isValidAgainstSchema(typeDefinition.evaluate.inputSchema, input)) {
        throw 'not valid input schema';
    }

    const evaluate = getObject(typeDefinition.evaluate.implementation);

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

function registerTypeDefinition(definition) {
    if (!objectsRegister[definition.type]) {
        objectsRegister[definition.type] = {};
    }
    objectsRegister[definition.type][definition.id] = definition;
}

function registerObject(objectId, object) {
    objectsRegister[objectId] = object;
}

module.exports = {
    evaluate,
    registerTypeDefinition,
    getObject,
    registerObject,
    isValidAgainstSchema,
    isFunction,
    isAsyncFunction
}