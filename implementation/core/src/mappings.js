import { compile, LambdaJSONError } from 'lambdajson-js';
import { fail } from './errors.js';
import { instancesOf } from './kinds.js';
import { onReset } from './registry.js';

let primitives = {};
let objectCache = new WeakMap();
const valueCache = new Map();

onReset(() => {
    primitives = {};
    objectCache = new WeakMap();
    valueCache.clear();
});

const cacheFor = tree => tree !== null && typeof tree === 'object' ? objectCache : valueCache;

const compiled = tree => {
    try {
        return compile(tree, primitives);
    } catch (error) {
        if (!(error instanceof LambdaJSONError)) throw error;
        return fail(error.code, error.message, { path: error.path });
    }
};

export const compileMapping = tree => {
    const cache = cacheFor(tree);
    if (!cache.has(tree)) cache.set(tree, compiled(tree));
    return cache.get(tree);
};

export const applyMapping = ({ mapping, input }) => compileMapping(mapping)(input);

const implementationOf = async ({ data }) => 'mapping' in data
    ? input => compileMapping(data.mapping)(input)
    : (await import(data.module))[data.export];

export const preparePureFunctions = async () => {
    const functions = await Promise.all(instancesOf('pure-function')
        .map(async element => [`$func/${element.id}`, await implementationOf(element)]));
    primitives = Object.fromEntries(functions.map(([name, fn]) => [name, argument => x => fn(argument(x))]));
};
