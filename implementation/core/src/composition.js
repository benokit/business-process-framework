import { isPlainObject, isUndefined, mapValues, omitBy } from 'lodash-es';
import { fail } from './errors.js';

const REPLACE = '/replace';
const UNSET = '/unset';
const APPEND = '/append';

const markerOf = tree => isPlainObject(tree) ? [REPLACE, UNSET, APPEND].find(key => key in tree) : undefined;

const typeError = path => fail('composition-type', `can't compose at '${path.join('.') || '/'}'`, { path });

const appendTo = (base, items, path) => Array.isArray(base) ? [...base, ...items] : typeError(path);

const append = (base, items, path) => {
    const marker = markerOf(base);
    return marker === REPLACE ? { [REPLACE]: appendTo(base[REPLACE], items, path) }
        : marker === UNSET ? { [REPLACE]: items }
            : marker === APPEND ? { [APPEND]: [...base[APPEND], ...items] }
                : appendTo(base, items, path);
};

const mergeObjects = (base, over, path) => Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(over)])]
    .map(key => [key, combine(base[key], over[key], [...path, key])]));

const overlay = (base, over, path) => {
    const marker = markerOf(base);
    if (marker === REPLACE) return { [REPLACE]: combine(base[REPLACE], over, path) };
    if (marker === UNSET) return { [REPLACE]: over };
    if (!isPlainObject(over)) return over;
    return marker === undefined && isPlainObject(base) ? mergeObjects(base, over, path) : typeError(path);
};

export const combine = (base, over, path = []) => {
    if (markerOf(over) === APPEND && !Array.isArray(over[APPEND])) typeError(path);
    return base === undefined ? over
        : over === undefined ? base
            : markerOf(over) === APPEND ? append(base, over[APPEND], path)
                : markerOf(over) !== undefined ? over
                    : overlay(base, over, path);
};

export const resolve = (tree, path = []) => {
    const marker = markerOf(tree);
    if (marker === APPEND && !Array.isArray(tree[APPEND])) typeError(path);
    return marker === REPLACE || marker === APPEND ? resolve(tree[marker], path)
        : marker === UNSET ? undefined
            : Array.isArray(tree) ? tree.map((item, index) => resolve(item, [...path, index]))
                : isPlainObject(tree) ? omitBy(mapValues(tree, (value, key) => resolve(value, [...path, key])), isUndefined)
                    : tree;
};

export const compose = items => resolve(items.reduce((base, over) => combine(base, over), undefined)) ?? {};
