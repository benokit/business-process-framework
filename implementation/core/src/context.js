import { isPlainObject } from 'lodash-es';
import { kindOf, onReset } from './registry.js';
import { resolveKind, selfOf } from './kinds.js';
import { check } from './schemas.js';
import { fail } from './errors.js';

let authors = new WeakMap();

onReset(() => {
    authors = new WeakMap();
});

const recordValue = (element, value) => {
    if (value === null || typeof value !== 'object' || authors.has(value)) return;
    authors.set(value, element);
    Object.values(value).forEach(child => recordValue(element, child));
};

export const recordAuthors = element => {
    recordValue(element, element.data);
    recordValue(element, selfOf(element).data);
};

export const authorOf = node => authors.get(node);

const managedBy = author => author === undefined
    ? {}
    : resolveKind(author.kind === 'kind' ? author.id : kindOf(author)).manages;

export const bind = (_ctx, bindings) => Object.freeze({ ..._ctx, ...bindings });

export const checkBindings = (node, bindings) => {
    if (!isPlainObject(bindings)) fail('invalid-binding', 'withContext must map to an object', { bindings });
    const author = authorOf(node);
    const manages = managedBy(author);
    Object.entries(bindings).forEach(([key, value]) => {
        if (!manages[key]) fail('context-right', `${author?.id ?? 'anonymous code'} may not bind context '${key}': it doesn't manage it`, { author: author?.id, key });
        check(`${manages[key]}/context/manages`, { [key]: value }, `withContext '${key}'`);
    });
};
