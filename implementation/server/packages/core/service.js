import { validateSchema } from './schema.js';
import { getObject } from './objects.js';
import { isPlainObject, isString } from 'lodash-es';
import { getData } from './data.js';

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
    let instanceObject = isString(instance) ? getData(instance) : instance;
    if (instanceObject.type === 'data') {
        instanceObject = {
            id: instanceObject.id,
            service: instanceObject.meta.service,
            configuration: instanceObject.data
        }
    }
    return await executeInstance(instanceObject, method, input);
}

async function executeInstance(instanceObject, method, input) {
    if (!(instanceObject && isPlainObject(instanceObject))) {
        throw 'instance should be an object';
    }

    const serviceDefinition = getObject('service', instanceObject.service);

    if (!serviceDefinition) {
        throw `service ${instanceObject.service} is not defined`;
    }

    const iface = isString(serviceDefinition.interface) ? getObject('interface', serviceDefinition.interface)?.methods : serviceDefinition.interface;

    if (!(iface && isPlainObject(iface))) {
        throw 'interface should be an object';
    }

    validateInputAgainstInterface(iface[method], input);

    const executor = (await import(serviceDefinition.implementation))[method];

    if (!executor) {
        throw `missing service implementation for the method`;
    }

    return await executor(instanceObject, input);
}

function validateInputAgainstInterface(methodInterface, input) {
    const inputValidation = validateSchema(methodInterface.input || {}, input)
     if (!inputValidation.isValid) {
        throw 'input is not valid: ' + JSON.stringify(inputValidation.errors);
    }
}
