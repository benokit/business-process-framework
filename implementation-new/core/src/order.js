import { fail } from './errors.js';

const BANDS = { first: 0, last: 2 };

const bandOf = position => BANDS[position] ?? 1;

const predecessorsOf = (items, { idOf, positionOf, afterOf, beforeOf }) => {
    const byId = new Map(items.filter(idOf).map(item => [idOf(item), item]));
    return new Map(items.map(item => [item, new Set([
        ...items.filter(other => bandOf(positionOf(other)) < bandOf(positionOf(item))),
        ...afterOf(item).filter(id => byId.has(id)).map(id => byId.get(id)),
        ...items.filter(other => idOf(item) !== undefined && beforeOf(other).includes(idOf(item)))
    ])]));
};

export const orderItems = (items, { label, idOf, positionOf = () => undefined, afterOf = () => [], beforeOf = () => [] }) => {
    const predecessors = predecessorsOf(items, { idOf, positionOf, afterOf, beforeOf });
    return items.reduce(ordered => {
        const next = items.find(item => !ordered.includes(item) && [...predecessors.get(item)].every(p => ordered.includes(p)));
        return next ? [...ordered, next] : fail('order-cycle', `cycle in the order of ${label}`, { label });
    }, []);
};
