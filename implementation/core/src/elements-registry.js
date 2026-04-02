import { registerSchema } from './schema.js';
import { registerPureFunction } from './pure-functions.js';
import { registerExecutionNodeTemplate } from './service.js';
import { evaluateData } from './data.js';

const registry = { };
const kindIndex = { };

function indexByKind(element) {
    const kind = element.kind ?? 'data';
    for (const subKind of subKinds(kind)) {
        if (!kindIndex[subKind]) {
            kindIndex[subKind] = new Set();
        }
        kindIndex[subKind].add(element);
    }
}

function subKinds(kind) {
  const parts = kind.split('/');
  return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

const kindSpecificRegistrationEffect = {
    'schema': (element) => {
        const schema = {
            $id: element.id,
            $data: element.data
        };
        registerSchema(schema);
        return;
    },

    'pure-function': registerPureFunction,

    'execution-node-template': (element) => {
        registerExecutionNodeTemplate(element.data.keyword, element.data.implementation)
    } 
}

function registerElement(element) {
    registry[element.id] = element;
    indexByKind(element);

    kindSpecificRegistrationEffect[element.kind]?.(element);
}

function getElement(id) {
    const element = registry[id];
    evaluateElement(element);
    return element;
}

function evaluateElement(element) {
    if (!element) return;
    if (!element['data'] && element['/data']) {
        element['data'] = evaluateData(element['/data'])
    }
}

function getElementsOfKind(kind) {
    const elements = [...(kindIndex[kind] ?? [])];
    for (const element of elements) {
        evaluateElement(element);
    }
    return { items: elements };
}

export {
    registerElement,
    getElement,
    getElementsOfKind
}
