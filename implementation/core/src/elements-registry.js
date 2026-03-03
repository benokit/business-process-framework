import { isString } from 'lodash-es';
import { registerSchema } from './schema.js';

const registry = {
    service: {},
    data: {},
    schema: {}
};

const kindIndex = {
    service: {},
    data: {},
    schema: {}
};

function indexByKind(element) {
    const kind = element.meta?.kind;
    if (kind === undefined) return;
    const bucket = kindIndex[element.type];
    if (!bucket[kind]) bucket[kind] = [];
    bucket[kind].push(element);
}

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
        indexByKind(element);
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
        indexByKind(serviceElement);
        return;
    }

    if (element.type === 'data') {
        registry.data[element.id] = element;
        indexByKind(element);
        return;
    }
}

function getElement(type, id) {
    return registry[type][id];
}

function getElements(type, kind) {
    if (kind === undefined) return Object.values(registry[type]);
    return kindIndex[type][kind] ?? [];
}

export {
    registerElement,
    getElement,
    getElements
}