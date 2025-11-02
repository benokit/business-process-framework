import { registerSchema } from 'system/schema.js';
import { keysIn } from 'lodash-es';

const registry = {
    class: {},
    data: {},
    schema: {},
    instance: {}
};

function registerObject(definition) {
    console.log(definition.id);
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

    registry[definition.type][definition.id] = definition;
}

function getObject(type, id) {
    console.log([type, id]);
    return registry[type][id];
}

function getObjectIdsOfType(type) {
    return keysIn(registry[type]);
}

export {
    registerObject,
    getObject,
    getObjectIdsOfType
}