const { registerSchema } = require('system/schema');
const { keysIn } = require('lodash')

const registry = {
    class: {},
    data: {},
    schema: {}
};

function registerObject(definition) {
    if (!definition.type) {
        return;
    }

    if (definition.type === 'schema') {
        const schema = {
            ...definition.data,
            '$id': definition.id
        };
        registerSchema(schema);
    }

    if (!registry[definition.type]) {
        registry[definition.type] = {};
    }
    registry[definition.type][definition.id] = definition;
}

function getObject(type, id) {
    return registry[type][id];
}

function getObjectIdsOfType(type) {
    return keysIn(registry[type]);
}

module.exports = {
    registerObject,
    getObject,
    getObjectIdsOfType
}