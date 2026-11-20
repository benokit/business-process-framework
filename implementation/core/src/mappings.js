import { compile, LambdaJSONError, LambdaJSONRuntimeError } from 'lambdajson-js';
import { CoreError } from './errors.js';
import { validatorFor } from './schemas.js';
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

const asCoreError = error => error instanceof LambdaJSONError || error instanceof LambdaJSONRuntimeError
    ? new CoreError(error.code, error.message, error.data ?? { path: error.path })
    : error;

const guarded = run => (...args) => {
    try {
        return run(...args);
    } catch (error) {
        throw asCoreError(error);
    }
};

const compiled = tree => guarded(guarded(compile)(tree, primitives));

export const compileMapping = tree => {
    const cache = cacheFor(tree);
    if (!cache.has(tree)) cache.set(tree, compiled(tree));
    return cache.get(tree);
};

export const applyMapping = ({ mapping, input }) => compileMapping(mapping)(input);

const implementationOf = async ({ data }) => 'mapping' in data
    ? input => compileMapping(data.mapping)(input)
    : (await import(data.module))[data.export];

const isChecking = () => process.env.NODE_ENV !== 'production';

const isOpen = schema => schema === undefined || schema === '@any' || (typeof schema === 'object' && Object.keys(schema).length === 0);

const verify = (name, side, schema, value) => {
    if (isOpen(schema)) return;
    const validate = validatorFor(`${name}/${side}`, schema);
    if (validate === undefined || validate(value)) return;
    const problems = validate.errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');
    throw new CoreError('function-contract', `${name}: its ${side} doesn't match its signature: ${problems} (${JSON.stringify(value)?.slice(0, 160)})`, { function: name, side, errors: validate.errors });
};

const verified = (name, signature, fn) => isChecking()
    ? argument => {
        verify(name, 'input', signature.input, argument);
        const result = fn(argument);
        verify(name, 'output', signature.output, result);
        return result;
    }
    : fn;

export const preparePureFunctions = async () => {
    const functions = await Promise.all(instancesOf('pure-function')
        .map(async element => [`$func/${element.id}`, await implementationOf(element)]));
    const signatures = Object.fromEntries(instancesOf('pure-function').map(({ id, data }) => [`$func/${id}`, data.signature]));
    primitives = Object.fromEntries(functions.map(([name, fn]) => [name, argument => x => verified(name, signatures[name], fn)(argument(x))]));
};
