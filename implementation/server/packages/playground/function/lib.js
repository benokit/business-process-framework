import { isFunction } from 'lodash-es';
import { getImplementation } from 'system/implementations-registry.js';

async function evaluate(functionInstance, input) {
    const fn = await getImplementation(functionInstance.configuration.implementation);

    if (!fn) {
        throw 'missing implementation';
    }

    if (!isFunction(fn)) {
        throw 'implementation is not a function';
    }

    return fn(input);
}

export default (methodId, functionInstance, input) => evaluate(functionInstance, input);
