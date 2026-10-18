import { allElements, kindOf } from './registry.js';
import { resolveKind, selfOf } from './kinds.js';
import { orderItems } from './order.js';
import { runMethod } from './execution/pipeline.js';
import { sequentially } from './execution/sequentially.js';

const hooksOf = (element, phase) => resolveKind(kindOf(element)).chain
    .map(kind => kind.data.lifecycle?.[phase])
    .filter(Boolean);

const byId = (a, b) => (a.id ?? '').localeCompare(b.id ?? '');

export const elementsInStartOrder = () => orderItems([...allElements()].sort(byId), {
    label: 'lifecycle hooks',
    idOf: element => element.id
});

const elementsFor = phase => phase === 'stop' ? elementsInStartOrder().reverse() : elementsInStartOrder();

const runHooks = (element, phase) => sequentially(hooksOf(element, phase),
    hook => runMethod(hook, { input: undefined, self: selfOf(element), _ctx: Object.freeze({}) }));

export const runLifecycle = phase => sequentially(elementsFor(phase), element => runHooks(element, phase));
