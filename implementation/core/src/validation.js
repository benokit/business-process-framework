import { allElements, findElement, kindOf } from './registry.js';
import { instancesOf, resolveKind, selfOf } from './kinds.js';
import { validateValue } from './schemas.js';
import { fillsOf, orderFills } from './slots.js';
import { elementsInStartOrder } from './lifecycle.js';
import { fail, problemsOf } from './errors.js';

const kinds = () => instancesOf('kind');

const groupKeys = (pick) => kinds().reduce((groups, kind) => pick(kind).reduce(
    (acc, key) => ({ ...acc, [key]: [...(acc[key] ?? []), kind.id] }), groups), {});

const managedKeys = () => groupKeys(kind => Object.keys(kind.data.context?.manages ?? {}));

const readKeys = () => groupKeys(kind => kind.data.context?.reads ?? []);

const hasRoot = ids => ids.some(root => ids.every(other => resolveKind(other).ids.includes(root)));

const contextProblems = () => {
    const managers = managedKeys();
    return [
        ...Object.keys(managers).filter(key => key.startsWith('!')).map(key => () =>
            fail('required-context', `context '${key.slice(1)}' can't be required`, { kinds: managers[key] })),
        ...Object.entries(managers).filter(([, ids]) => !hasRoot(ids)).map(([key, ids]) => () =>
            fail('context-managers', `context '${key}' is managed by unrelated kinds: ${ids.join(', ')}`, { key, kinds: ids })),
        ...Object.entries(readKeys()).filter(([key]) => !managers[key]).map(([key, ids]) => () =>
            fail('unmanaged-context', `${ids.join(', ')} read context '${key}', which no kind manages`, { key, kinds: ids }))
    ];
};

const shapeProblems = element => resolveKind(kindOf(element)).chain
    .filter(kind => kind.data.shape !== undefined)
    .map(kind => () => {
        const { isValid, errors } = validateValue({ schemaId: kind.id, value: selfOf(element).data });
        if (!isValid) fail('invalid-element', `${element.id ?? 'an element'} doesn't match the shape of ${kind.id}`, { element: element.id, kind: kind.id, errors });
    });

const targetKind = target => {
    const element = findElement(target) ?? fail('unknown-target', `slot fill target '${target}' doesn't exist`, { target });
    return resolveKind(element.kind === 'kind' ? element.id : kindOf(element));
};

const fillProblem = fill => () => {
    const { target, slot, value, position } = fill.data;
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

const startOrderNames = () => kinds().flatMap(kind => ['startAfter', 'startBefore']
    .flatMap(property => (kind.data.lifecycle?.[property] ?? []).map(name => () => {
        if (findElement(name)?.kind !== 'kind') fail('unknown-kind', `${kind.id}: ${property} names '${name}', which is not a kind`, { kind: kind.id, name });
    })));

const checks = () => [
    ...kinds().map(kind => () => resolveKind(kind.id)),
    ...contextProblems(),
    ...allElements().flatMap(shapeProblems),
    ...instancesOf('slot-fill').map(fillProblem),
    ...allElements().filter(element => element.id !== undefined).flatMap(orderProblems),
    ...startOrderNames(),
    elementsInStartOrder
];

export const validate = () => checks().flatMap(problemsOf);
