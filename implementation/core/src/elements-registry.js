import { isString } from 'lodash-es';
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
        registry.schema[element.id] = element;
        return;
    }

    if (element.type === 'service') {
        const serviceElement = { ...element };

        if (!isString(element.interface)) {
            const ifaceId = 'iface@' + element.id;
            registry.data[ifaceId] = { type: 'data', id: ifaceId, data: element.interface };
            serviceElement.interface = ifaceId;
        }

        if (!isString(element.implementation)) {
            const implId = 'impl@' + element.id;
            registry.data[implId] = { type: 'data', id: implId, data: element.implementation };
            serviceElement.implementation = implId;
        }
        
        registry.service[serviceElement.id] = serviceElement;
        return;
    }

    if (element.type === 'data') {
        registry.data[element.id] = element;
        return;
    }
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