import { validateSchema } from './schema.js';
import { getObject } from './objects.js';
import { isPlainObject, isString } from 'lodash-es';
import { getInstance } from './instance.js';

export {
    execute
};

/**
 * 
 * @param {String|Object} instance 
 * @param {String} method 
 * @param {Object} input 
 * @returns 
 */
async function execute(instance, method, input) {
    const instanceObject = isString(instance) ? getInstance(instance) : instance;
    return await executeInstance(instanceObject, method, input);
}

async function executeInstance(instanceObject, method, input) {
    if (!(instanceObject && isPlainObject(instanceObject))) {
        throw 'instance should be an object';
    }

    if (!instanceObject.class) {
        throw 'instance should have property class'
    }

    const classDefinition = getObject('class', instanceObject.class);

    if (!classDefinition) {
        throw `class ${instanceObject.class} is not defined`;
    }

    const iface = isString(classDefinition.interface) ? getObject('interface', classDefinition.interface)?.methods : classDefinition.interface;

    if (!(iface && isPlainObject(iface))) {
        throw 'interface should be an object';
    }

    validateInputAgainstInterface(iface[method], input);

    const executor = (await import(classDefinition.implementation))[method];

    if (!executor) {
        throw `missing class implementation for the method`;
    }

    return await executor(instanceObject, input);
}

function validateInputAgainstInterface(methodInterface, input) {
    const inputValidation = validateSchema(methodInterface.input || {}, input)
     if (!inputValidation.isValid) {
        throw 'input is not valid: ' + JSON.stringify(inputValidation.errors);
    }
}
