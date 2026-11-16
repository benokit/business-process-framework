import { errorTypeOf, isRegistered } from '@business-framework/core/error-types';
import { isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { findElement } from '@business-framework/core/registry';
import { traitsOf } from '@business-framework/entities/traits';
import { extensionsOf } from './process.js';

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

const taskOutcomesOf = entityType => findElement('task-trait') === undefined
    ? undefined
    : Object.values(traitsOf(entityType)).find(({ trait }) => isInstanceOf({ element: trait, kind: 'task-trait' }))?.configuration.outcomes;

const resolveProblems = (roles, name, wait) => {
    const entries = (wait?.when ?? []).flatMap(({ resolve }) => Object.entries(resolve ?? {}));
    const declared = entries.filter(([role]) => roles[role] !== undefined);
    return [
        ...entries.filter(([role]) => roles[role] === undefined).map(([role]) => `step '${name}' resolves the role '${role}', which the process doesn't declare`),
        ...declared.filter(([role]) => taskOutcomesOf(roles[role].entityType) === undefined).map(([role]) => `step '${name}' resolves the role '${role}', which isn't a task`),
        ...declared.filter(([role, outcome]) => taskOutcomesOf(roles[role].entityType) !== undefined && taskOutcomesOf(roles[role].entityType)[outcome] === undefined)
            .map(([role, outcome]) => `step '${name}' resolves '${role}' with '${outcome}', an outcome its task doesn't declare`),
        ...[...new Set(declared.map(([role]) => role))].flatMap(role => Object.entries(taskOutcomesOf(roles[role].entityType) ?? {})
            .filter(([outcome, declaration]) => declaration !== true && declaration.answer !== undefined && !declared.some(([other, resolved]) => other === role && resolved === outcome))
            .map(([outcome]) => `step '${name}' waits on '${role}' but no entry resolves the outcome '${outcome}' a user may give`))
    ];
};

const waitProblems = (roles, name, wait) => wait === undefined ? [] : [
    ...(wait.when ?? []).length === 0 && Object.keys(wait.signals ?? {}).length === 0 && wait.until === undefined ? [`step '${name}' waits for nothing: it needs a when, a signal or an until`] : [],
    ...Object.entries(wait.signals ?? {}).filter(([, { by }]) => roles[by] === undefined).map(([signal, { by }]) => `step '${name}' signal '${signal}' is addressed by the role '${by}', which the process doesn't declare`),
    ...untilProblems(name, wait.until),
    ...resolveProblems(roles, name, wait)
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

const signalNamesOf = steps => Object.values(steps).flatMap(step => Object.keys(step.wait?.signals ?? {}));

export const processTriggerProblems = id => {
    const { data } = selvesOf('process-trigger').find(element => element.id === id);
    const effects = ['start', 'signal'].filter(effect => data[effect] !== undefined);
    const target = effects.length === 1 ? data[effects[0]].process : undefined;
    const definition = selvesOf('process-entity-type').find(element => element.id === target)?.data.definition;
    const steps = selvesOf('process-definition').find(element => element.id === definition)?.data.steps ?? {};
    return [
        ...effects.length === 1 ? [] : [`${id} must either start or signal a process, not ${effects.length === 0 ? 'neither' : 'both'}`],
        ...effects.length === 1 && definition === undefined ? [`${id} names ${target}, which is no process entity type`] : [],
        ...data.signal !== undefined && definition !== undefined && !signalNamesOf(steps).includes(data.signal.name) ? [`${id} signals '${data.signal.name}', which ${definition} doesn't wait for`] : []
    ];
};

const extensionProblems = (id, steps) => extensionsOf(id)
    .filter(({ step }) => steps[step]?.extensible !== true)
    .map(({ step }) => `${id} is extended at the step '${step}', which ${steps[step] === undefined ? "doesn't exist" : "isn't marked extensible"}`);

export const processDefinitionProblems = definition => {
    const { data } = selvesOf('process-definition').find(({ id }) => id === definition);
    return [
        ...startProblems(data),
        ...extensionProblems(definition, data.steps),
        ...Object.entries(data.steps).flatMap(stepProblems(data.steps, data.entities)),
        ...reachabilityProblems(data),
        ...loopProblems(data)
    ];
};
