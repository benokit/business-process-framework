import { registerSchema } from './schema.js';

const registry = {
    service: {},
    data: {},
    schema: {}
};

function registerElement(element) {
    if (!element.type) {
        return;
    }

    if (element.type === 'schema') {
        const schema = {
            $id: element.id,
            $data: element.schema
        };
        registerSchema(schema);
    }

    if (element.type === 'service') {
        registry[data]['iface@' + element.id] = element.interface;
        registry[data]['impl@' + element.id] = element.implementation;
    }

    registry[element.type][element.id] = element;
}

function getElement(type, id) {
    return registry[type][id];
}

function getElementsOfType(type) {
    return Object.values(registry[type]);
}

export {
    registerElement,
    getElement,
    getElementsOfType
}