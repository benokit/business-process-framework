import { registerSchema } from 'system/schema.js';
import { keysIn } from 'lodash-es';
import { compactToStandard } from '@benokit/js-cjsl';

const registry = {
    class: {},
    data: {},
    schema: {},
    instance: {}
};

function registerObject(definition) {
    if (!definition.type) {
        return;
    }

    if (definition.type === 'schema') {
        const schema = {
            id: definition.id,
            ...definition.schema
        };
        registerSchema(compactToStandard(schema));
    }

    registry[definition.type][definition.id] = definition;
}

function getObject(type, id) {
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