const { getObject, getObjectIdsOfType } = require('system/objects-registry');
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

    const instanceDefinition = getObject(instanceType, instanceId);

    if (!instanceDefinition) {
        return null;
    }

    instanceCache[instanceKey] = {
        ...instanceDefinition,
        configuration: evaluateData(instanceDefinition.configuration)
    };

    return instanceCache[instanceKey];
}

function getInstancesOfClass(instanceType) {
    return getObjectIdsOfType(instanceType).map(i => getInstance(instanceType, i));
} 

module.exports = {
    getInstance,
    getInstancesOfClass
};
