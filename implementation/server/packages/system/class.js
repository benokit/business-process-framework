import { validateSchema } from 'system/schema.js';
import { getObject } from 'system/objects-registry.js';
import { isFunction, isPlainObject, isString } from 'lodash-es';
import { getInstance } from 'system/instances-registry.js';

export {
    execute
};

/**
 * 
 * @param {String|Object} instance 
 * @param {String} methodId 
 * @param {Object} input 
 * @returns 
 */
async function execute(instance, methodId, input) {
    const instanceObject = isString(instance) ? getInstance(instance) : instance;
    return await executeInstance(instanceObject, methodId, input);
}

async function executeInstance(instanceObject, methodId, input) {
    if (!(instanceObject && isPlainObject(instanceObject))) {
        throw 'expecting object';
    }

    const classDefinition = getObject('class', instanceObject.class);

    if (!classDefinition) {
        throw 'class is not defined';
    }

    const iface = isString(classDefinition.interface) ? getObject('interface', classDefinition.interface)?.methods : classDefinition.interface;

    const inputValidation = validateInputAgainstInterface(iface[methodId], input);
    if (!inputValidation.isValid) {
        throw 'input is not valid: ' + JSON.stringify(inputValidation.errors);
    }

    const executor = (await import(classDefinition.implementation))[methodId];

    if (!executor) {
        throw 'missing implementation';
    }

    if (!isFunction(executor)) {
        throw 'implementation is not a function';
    }

    return await executor(instanceObject.configuration, input);
}

function validateInputAgainstInterface(methodInterface, input) {
    return validateSchema(methodInterface.input || {}, input)
}
