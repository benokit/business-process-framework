import { allElements, kindOf } from './registry.js';
import { instancesOf, resolveKind, selfOf } from './kinds.js';
import { orderItems } from './order.js';
import { runMethod } from './execution/pipeline.js';
import { sequentially } from './execution/sequentially.js';

const chainOf = element => resolveKind(kindOf(element)).chain;

const hooksOf = (element, phase) => chainOf(element)
    .map(kind => kind.data.lifecycle?.[phase])
    .filter(Boolean);

const namedKinds = (element, property) => chainOf(element).flatMap(kind => kind.data.lifecycle?.[property] ?? []);

const instancesNamed = (element, property) => namedKinds(element, property).flatMap(instancesOf);

const startPositionOf = element => chainOf(element)
    .map(kind => kind.data.lifecycle?.startPosition)
    .findLast(Boolean);

const byId = (a, b) => (a.id ?? '').localeCompare(b.id ?? '');

const elementsById = () => [...allElements()].sort(byId);

export const elementsInStartOrder = () => orderItems(elementsById(), {
    label: 'start hooks',
    positionOf: startPositionOf,
    afterOf: element => instancesNamed(element, 'startAfter'),
    beforeOf: element => instancesNamed(element, 'startBefore')
});

const ELEMENTS_FOR = {
    load: elementsById,
    start: elementsInStartOrder,
    stop: () => elementsInStartOrder().reverse()
};

const runHooks = (element, phase) => sequentially(hooksOf(element, phase),
    hook => runMethod(hook, { input: undefined, self: selfOf(element), _ctx: Object.freeze({}) }));

export const runLifecycle = phase => sequentially(ELEMENTS_FOR[phase](), element => runHooks(element, phase));
