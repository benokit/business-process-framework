import { instancesOf } from './kinds.js';
import { slotValues } from './slots.js';
import { lazy } from './registry.js';

const CODE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const UNREGISTERED = { http: 500, transient: false, outage: false };

const registryIds = () => instancesOf('error-registry').map(({ id }) => id);

const declarationsOf = lazy(() => registryIds().flatMap(element => slotValues({ element, slot: 'errorTypes' })));

const declarationOf = code => declarationsOf().find(declaration => declaration.code === code);

export const isRegistered = code => declarationOf(code) !== undefined;

const chainOf = (code, seen = []) => {
    const declaration = declarationOf(code);
    return declaration === undefined || seen.includes(code)
        ? []
        : [...chainOf(declaration.extends, [...seen, code]), declaration];
};

export const isKindOfError = (code, ancestor) => chainOf(code).some(declaration => declaration.code === ancestor);

export const errorTypeOf = code => chainOf(code).reduce(
    (type, { http, transient, outage }) => ({
        http: http ?? type.http,
        transient: transient ?? type.transient,
        outage: outage ?? type.outage
    }),
    UNREGISTERED);

const duplicates = declarations => [...new Set(declarations.map(({ code }) => code))]
    .filter(code => declarations.filter(declaration => declaration.code === code).length > 1)
    .map(code => `the error code '${code}' is registered twice`);

const parentProblems = ({ code, extends: parent }) => parent === undefined || declarationOf(parent) !== undefined
    ? []
    : [`the error code '${code}' extends '${parent}', which no package registers`];

const cycleProblems = ({ code }) => {
    const [root] = chainOf(code);
    return root?.extends !== undefined && declarationOf(root.extends) !== undefined
        ? [`the error code '${code}' extends itself through '${root.code}'`]
        : [];
};

const propertyProblems = ({ code, http, outage }) => [
    ...CODE.test(code) ? [] : [`'${code}' isn't a valid error code: lowercase letters and digits in segments separated by '-'`],
    ...http === undefined || (http >= 400 && http <= 599) ? [] : [`the error code '${code}' has the status ${http}, outside 400-599`],
    ...outage === true && !errorTypeOf(code).transient ? [`the error code '${code}' is an outage but not transient`] : []
];

export const errorRegistryProblems = () => [
    ...duplicates(declarationsOf()),
    ...declarationsOf().flatMap(declaration => [
        ...parentProblems(declaration),
        ...cycleProblems(declaration),
        ...propertyProblems(declaration)
    ])
];
