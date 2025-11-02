import { getObject } from 'system/objects-registry.js';
import { evaluateData } from 'system/data.js';

const instanceCache = {};

function getInstanceCacheKey(instanceId) {
    return instanceId;
}

function getInstance(instanceId) {
    const instanceKey = getInstanceCacheKey(instanceId);
    
    if (instanceCache[instanceKey]) {
        return instanceCache[instanceKey];
    }

    const instanceDefinition = getObject('instance', instanceId);

    if (!instanceDefinition) {
        return null;
    }

    instanceCache[instanceKey] = {
        ...instanceDefinition,
        configuration: evaluateData(instanceDefinition.configuration)
    };

    return instanceCache[instanceKey];
}

export {
    getInstance
};
