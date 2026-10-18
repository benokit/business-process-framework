import { fail } from './errors.js';

const byId = new Map();
const elements = [];
const resets = [];

export const register = element => {
    if (element.id !== undefined && byId.has(element.id)) {
        fail('duplicate-element', `element '${element.id}' is defined twice`, { id: element.id });
    }
    if (element.id !== undefined) byId.set(element.id, element);
    elements.push(element);
};

export const findElement = id => byId.get(id);

export const getElement = id => byId.get(id) ?? fail('unknown-element', `unknown element '${id}'`, { id });

export const allElements = () => elements;

export const kindOf = element => element.kind ?? 'data';

export const onReset = clear => resets.push(clear);

export const reset = () => {
    byId.clear();
    elements.length = 0;
    resets.forEach(clear => clear());
};

export const memo = compute => {
    const cache = new Map();
    onReset(() => cache.clear());
    return key => {
        if (!cache.has(key)) cache.set(key, compute(key));
        return cache.get(key);
    };
};

export const lazy = compute => {
    const cached = memo(compute);
    return () => cached(undefined);
};
