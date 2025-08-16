const { registerSchema } = require('system/schema');

const register = {};

function registerDefinition(definition) {
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

    if (!register[definition.type]) {
        register[definition.type] = {};
    }
    register[definition.type][definition.id] = definition;
}

function getDefinition(type, id) {
    return register[type][id];
}

module.exports = {
    registerDefinition,
    getDefinition
}