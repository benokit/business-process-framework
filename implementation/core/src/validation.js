import { allElements, findElement, kindOf } from './registry.js';
import { instancesOf, resolveKind, selfOf } from './kinds.js';
import { validateValue } from './schemas.js';
import { applyMapping } from './mappings.js';
import { fillsOf, orderFills } from './slots.js';
import { elementsInStartOrder } from './lifecycle.js';
import { checkAbstraction, checkBinding, isKindReference, resolveReference } from './references.js';
import { fail, problemsOf } from './errors.js';
import { codeOf, codeProblems, targetKind } from './code.js';
import { effectProblems } from './effect-inference.js';
import { flowProblems } from './data-flow.js';
import { settingsProblems } from './settings.js';

const kinds = () => instancesOf('kind');

const managedKeys = () => kinds().reduce((groups, kind) => Object.keys(kind.data.context?.manages ?? {}).reduce(
    (acc, key) => ({ ...acc, [key]: [...(acc[key] ?? []), kind.id] }), groups), {});

const hasRoot = ids => ids.some(root => ids.every(other => resolveKind(other).ids.includes(root)));

const contextProblems = () => {
    const managers = managedKeys();
    return [
        ...Object.keys(managers).filter(key => key.startsWith('!')).map(key => () =>
            fail('required-context', `context '${key.slice(1)}' can't be required`, { kinds: managers[key] })),
        ...Object.entries(managers).filter(([, ids]) => !hasRoot(ids)).map(([key, ids]) => () =>
            fail('context-managers', `context '${key}' is managed by unrelated kinds: ${ids.join(', ')}`, { key, kinds: ids }))
    ];
};

const shapeProblems = element => resolveKind(kindOf(element)).chain
    .filter(kind => kind.data.shape !== undefined)
    .map(kind => () => {
        const { isValid, errors } = validateValue({ schemaId: kind.id, value: selfOf(element).data });
        if (!isValid) fail('invalid-element', `${element.id ?? 'an element'} doesn't match the shape of ${kind.id}`, { element: element.id, kind: kind.id, errors });
    });

const fillProblem = fill => () => {
    const { target, slot, value, position } = fill.data;
    if (!findElement(target)) return;
    const declaration = targetKind(target).slots[slot]
        ?? fail('unknown-slot', `${target} has no slot '${slot}'`, { target, slot });
    if (declaration.cardinality === 'one' && position !== undefined) {
        fail('slot-position', `a fill of the 'one' slot '${slot}' can't have a position`, { target, slot });
    }
    const { isValid, errors } = validateValue({ schemaId: `${declaration.owner}/slots/${slot}`, value });
    if (!isValid) fail('invalid-fill', `${fill.id ?? `a fill of ${target}.${slot}`} doesn't match the slot's value schema`, { target, slot, errors });
};

const orderProblems = element => Object.entries(resolveKind(kindOf(element)).slots)
    .filter(([, declaration]) => declaration.cardinality === 'many')
    .map(([slot]) => () => {
        const { fills, targets } = fillsOf(selfOf(element), slot);
        orderFills(fills, targets, slot);
    });

const unimplementedOperations = element => Object.entries(resolveKind(kindOf(element)).operations)
    .filter(([, operation]) => operation.implementation === undefined)
    .map(([name, operation]) => () => fail('unimplemented-operation',
        `${element.id} doesn't implement ${operation.owner}.${name}`, { element: element.id, operation: name }));

const kindReferences = value => {
    if (isKindReference(value)) return [value];
    if (typeof value !== 'object' || value === null) return [];
    return Object.values(value).flatMap(kindReferences);
};

const referenceProblems = element => {
    const inCode = new Set(codeOf(element).flatMap(({ code }) => kindReferences(code)));
    return kindReferences(element.data).map(reference => () => inCode.has(reference) ? checkAbstraction(reference) : resolveReference(reference));
};

const isWarning = message => typeof message === 'object' && message !== null && 'warning' in message;

const hookMessages = (element, kind) => applyMapping({ mapping: kind.data.lifecycle.validate, input: { self: selfOf(element) } }) ?? [];

const quietly = messagesOf => (...args) => {
    try {
        return messagesOf(...args);
    } catch {
        return [];
    }
};

const hookProblem = (element, kind, messagesOf, severity) => () => {
    const messages = messagesOf(element, kind);
    if (messages.length > 0) fail('invalid-element', `${element.id}: ${messages.join('; ')}`, { element: element.id, kind: kind.id, messages, ...severity && { severity } });
};

const hookErrors = (element, kind) => hookMessages(element, kind).filter(message => !isWarning(message));

const hookWarnings = quietly((element, kind) => hookMessages(element, kind).filter(isWarning).map(message => message.warning));

const hookProblems = element => resolveKind(kindOf(element)).chain
    .filter(kind => kind.data.lifecycle?.validate !== undefined)
    .flatMap(kind => [hookProblem(element, kind, hookErrors), hookProblem(element, kind, hookWarnings, 'warning')]);

const checks = () => [
    ...kinds().map(kind => () => resolveKind(kind.id)),
    ...contextProblems(),
    ...allElements().flatMap(shapeProblems),
    ...settingsProblems(),
    ...instancesOf('slot-fill').map(fillProblem),
    ...allElements().filter(element => element.id !== undefined).flatMap(orderProblems),
    ...allElements().filter(element => element.id !== undefined).flatMap(unimplementedOperations),
    ...instancesOf('binding').map(binding => () => checkBinding(binding)),
    ...allElements().flatMap(referenceProblems),
    ...allElements().flatMap(codeProblems),
    ...allElements().flatMap(flowProblems),
    ...allElements().filter(element => element.id !== undefined).flatMap(hookProblems),
    elementsInStartOrder
];

const inferredProblems = () => {
    try {
        return effectProblems().flatMap(problemsOf);
    } catch (error) {
        return problemsOf(() => { throw error; });
    }
};

const isWarningProblem = problem => problem.data?.severity === 'warning';

export const validate = ({ warnings = false } = {}) => {
    const all = checks().flatMap(problemsOf);
    const problems = all.filter(problem => !isWarningProblem(problem));
    const inferred = inferredProblems();
    const failed = inferred.some(({ code }) => code !== 'effect-bound');
    return [...problems, ...problems.length > 0 && failed ? [] : inferred, ...warnings ? all.filter(isWarningProblem) : []];
};
