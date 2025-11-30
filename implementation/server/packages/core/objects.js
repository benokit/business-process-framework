import { registerSchema } from './schema.js';

const registry = {
    service: {},
    data: {},
    schema: {},
    interface: {}
};

function registerObject(definition) {
    if (!definition.type) {
        return;
    }

    if (definition.type === 'schema') {
        const schema = {
            $id: definition.id,
            $data: definition.schema
        };
        registerSchema(schema);
    }

    registry[definition.type][definition.id] = definition;
}

function getObject(type, id) {
    return registry[type][id];
}

function getObjectsOfType(type) {
    return Object.values(registry[type]);
}

export {
    registerObject,
    getObject,
    getObjectsOfType
}