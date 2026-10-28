import { getElement } from './registry.js';
import { instancesOf, resolveKind, selfOf } from './kinds.js';
import { orderItems } from './order.js';
import { fail } from './errors.js';
import { ownedBy } from './execution/owners.js';

const baseOrder = targets => (a, b) =>
    targets.indexOf(a.data.target) - targets.indexOf(b.data.target) || (a.id ?? '').localeCompare(b.id ?? '');

export const orderFills = (fills, targets, slot) => {
    const byId = id => fills.find(fill => fill.id === id);
    return orderItems([...fills].sort(baseOrder(targets)), {
        label: `'${slot}' fills`,
        positionOf: fill => fill.data.position,
        afterOf: fill => (fill.data.after ?? []).map(byId),
        beforeOf: fill => (fill.data.before ?? []).map(byId)
    });
};

const singleValue = (fills, targets, slot) => {
    const target = targets.findLast(t => fills.some(fill => fill.data.target === t));
    const candidates = fills.filter(fill => fill.data.target === target);
    if (candidates.length > 1) fail('ambiguous-slot', `${candidates.length} '${slot}' fills target '${target}'`, { slot, target });
    return candidates[0] ? ownedBy(candidates[0].id, candidates[0].data.value) : null;
};

export const fillsOf = (self, slot) => {
    const kind = resolveKind(self.kind);
    const declaration = kind.slots[slot] ?? fail('unknown-slot', `${self.kind} declares no slot '${slot}'`, { kind: self.kind, slot });
    const targets = [...kind.ids, self.id];
    const fills = instancesOf('slot-fill').filter(fill => fill.data.slot === slot && targets.includes(fill.data.target));
    return { declaration, targets, fills };
};

export const slotValues = ({ element, slot }) => {
    const { declaration, targets, fills } = fillsOf(selfOf(getElement(element)), slot);
    return declaration.cardinality === 'one'
        ? singleValue(fills, targets, slot)
        : orderFills(fills, targets, slot).map(fill => ownedBy(fill.id, fill.data.value));
};
