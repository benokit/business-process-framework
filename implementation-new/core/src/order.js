import { fail } from './errors.js';

const BANDS = { first: 0, last: 2 };

const bandOf = position => BANDS[position] ?? 1;

const predecessorsOf = (items, { positionOf, afterOf, beforeOf }) => new Map(items.map(item => [item, new Set([
    ...items.filter(other => bandOf(positionOf(other)) < bandOf(positionOf(item))),
    ...afterOf(item).filter(other => items.includes(other)),
    ...items.filter(other => beforeOf(other).includes(item))
])]));

export const orderItems = (items, { label, positionOf = () => undefined, afterOf = () => [], beforeOf = () => [] }) => {
    const predecessors = predecessorsOf(items, { positionOf, afterOf, beforeOf });
    return items.reduce(ordered => {
        const next = items.find(item => !ordered.includes(item) && [...predecessors.get(item)].every(p => ordered.includes(p)));
        return next ? [...ordered, next] : fail('order-cycle', `cycle in the order of ${label}`, { label });
    }, []);
};
