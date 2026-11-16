import { errorTypeOf, isRegistered } from '@business-framework/core/error-types';
import { selvesOf } from '@business-framework/core/kinds';

const EXITS = ['next', 'choose', 'wait', 'end'];

const exitsOf = step => EXITS.filter(exit => step[exit] !== undefined);

const immediateTargetsOf = step => [
    ...step.next === undefined ? [] : [step.next],
    ...(step.choose ?? []).filter(Array.isArray).map(([, target]) => target),
    ...(step.onError ?? []).map(({ then }) => then)
];

const waitTargetsOf = step => [
    ...(step.wait?.when ?? []).map(({ then }) => then),
    ...Object.values(step.wait?.signals ?? {}).map(({ to }) => to),
    ...step.wait?.until === undefined ? [] : [step.wait.until.then]
];

const targetsOf = step => [...immediateTargetsOf(step), ...waitTargetsOf(step)];

const reachableFrom = (steps, names) => {
    const known = names.filter(name => steps[name] !== undefined);
    const next = [...new Set(known.flatMap(name => targetsOf(steps[name])))].filter(name => steps[name] !== undefined && !known.includes(name));
    return next.length === 0 ? known : reachableFrom(steps, [...known, ...next]);
};

const loopsOf = (steps, name, path = []) => path.includes(name)
    ? [path.slice(path.indexOf(name))]
    : immediateTargetsOf(steps[name] ?? {}).flatMap(target => steps[target] === undefined ? [] : loopsOf(steps, target, [...path, name]));

const exitProblems = (name, step) => exitsOf(step).length === 1
    ? []
    : [`step '${name}' has ${exitsOf(step).length === 0 ? 'no exit' : `${exitsOf(step).join(' and ')}, which are several exits`}: exactly one of ${EXITS.join(', ')}`];

const targetProblems = (steps, name, step) => targetsOf(step)
    .filter(target => steps[target] === undefined)
    .map(target => `step '${name}' leads to unknown step '${target}'`);

const chooseProblems = (name, step) => (step.choose ?? [])
    .filter(entry => !Array.isArray(entry) || entry.length !== 2 || typeof entry[1] !== 'string')
    .map(() => `step '${name}' has a choose entry that isn't [test, step]`);

const untilProblems = (name, until) => until === undefined || [until.at, until.after].filter(value => value !== undefined).length === 1
    ? []
    : [`step '${name}' waits until a date or after a duration: exactly one of at and after`];

const waitProblems = (roles, name, wait) => wait === undefined ? [] : [
    ...(wait.when ?? []).length === 0 && Object.keys(wait.signals ?? {}).length === 0 && wait.until === undefined ? [`step '${name}' waits for nothing: it needs a when, a signal or an until`] : [],
    ...Object.entries(wait.signals ?? {}).filter(([, { by }]) => roles[by] === undefined).map(([signal, { by }]) => `step '${name}' signal '${signal}' is addressed by the role '${by}', which the process doesn't declare`),
    ...untilProblems(name, wait.until)
];

const catchProblems = (name, entry) => [
    ...entry.catches.length === 0 ? [`step '${name}' has an onError entry that catches nothing`] : [],
    ...entry.catches.filter(code => !isRegistered(code)).map(code => `step '${name}' catches '${code}', which no package registers`),
    ...entry.catches.filter(code => isRegistered(code) && errorTypeOf(code).transient).map(code => `step '${name}' catches '${code}', which is transient: a transient error is retried, so it can't be caught`)
];

const stepProblems = (steps, roles) => ([name, step]) => [
    ...exitProblems(name, step),
    ...targetProblems(steps, name, step),
    ...chooseProblems(name, step),
    ...waitProblems(roles, name, step.wait),
    ...(step.onError ?? []).flatMap(entry => catchProblems(name, entry))
];

const startProblems = ({ start, steps }) => steps[start] === undefined ? [`the start step '${start}' isn't a step`] : [];

const reachabilityProblems = ({ start, steps }) => steps[start] === undefined
    ? []
    : Object.keys(steps).filter(name => !reachableFrom(steps, [start]).includes(name)).map(name => `step '${name}' can't be reached from '${start}'`);

const loopProblems = ({ steps }) => [...new Set(Object.keys(steps).flatMap(name => loopsOf(steps, name).map(loop => [...loop].sort().join(', '))))]
    .map(loop => `the steps ${loop} lead to each other without ever waiting: an endless chain of immediate steps`);

export const processDefinitionProblems = definition => {
    const { data } = selvesOf('process-definition').find(({ id }) => id === definition);
    return [
        ...startProblems(data),
        ...Object.entries(data.steps).flatMap(stepProblems(data.steps, data.entities)),
        ...reachabilityProblems(data),
        ...loopProblems(data)
    ];
};
