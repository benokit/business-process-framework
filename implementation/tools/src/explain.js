import path from 'path';
import { getElement } from '@business-framework/core';
import { fillsOf, instancesOf, orderFills, resolveKind, selfOf, sourceOf } from '@business-framework/core/introspection';

const relative = file => file && path.relative(process.cwd(), file);

const implementer = (chain, name) => chain.findLast(kind => kind.data.operations?.[name]?.implementation)?.id;

const operationsOf = ({ chain, operations }) => Object.entries(operations).map(([name, { input, output, owner }]) =>
    ({ name, input, output, declaredBy: owner, implementedBy: implementer(chain, name) }));

const isSetting = value => typeof value === 'string' || (Array.isArray(value) && value.every(item => typeof item === 'string'));

const lifecycleEntry = (chain, hook) => {
    const kinds = chain.filter(kind => kind.data.lifecycle?.[hook] !== undefined);
    const value = kinds.at(-1).data.lifecycle[hook];
    return { hook, kinds: kinds.map(kind => kind.id), ...(isSetting(value) && { value }) };
};

const lifecycleOf = chain => [...new Set(chain.flatMap(kind => Object.keys(kind.data.lifecycle ?? {})))]
    .map(hook => lifecycleEntry(chain, hook));

const winningFills = (fills, targets) => {
    const target = targets.findLast(t => fills.some(fill => fill.data.target === t));
    return fills.filter(fill => fill.data.target === target);
};

const fillOf = fill => ({ id: fill.id, target: fill.data.target, source: relative(sourceOf(fill)) });

const declarationOf = (ids, slot) => instancesOf('slot-declaration')
    .find(declaration => declaration.data.slot === slot && ids.includes(declaration.data.target));

const declaredBy = (ids, slot, owner) => {
    const declaration = declarationOf(ids, slot);
    return declaration ? `${declaration.id ?? 'slot-declaration'} ${relative(sourceOf(declaration))}` : owner;
};

const slotsOf = self => {
    const { ids, slots } = resolveKind(self.kind);
    return Object.entries(slots).map(([name, { cardinality, value, owner }]) => {
        const { targets, fills } = fillsOf(self, name);
        const ordered = cardinality === 'one' ? winningFills(fills, targets) : orderFills(fills, targets, name);
        return { name, cardinality, value, declaredBy: declaredBy(ids, name, owner), fills: ordered.map(fillOf) };
    });
};

const bindingsOf = id => instancesOf('binding').filter(binding => binding.data.abstraction === id).map(binding => binding.data.instance);

const kindDescription = element => {
    const kind = resolveKind(element.id);
    return {
        chain: kind.ids,
        shapes: Object.fromEntries(kind.chain.filter(k => k.data.shape).map(k => [k.id, k.data.shape])),
        defaults: kind.defaults,
        manages: kind.manages,
        operations: operationsOf(kind),
        slots: slotsOf({ id: element.id, kind: element.id }),
        lifecycle: lifecycleOf(kind.chain),
        instances: instancesOf(element.id).map(instance => instance.id).filter(Boolean),
        bindings: bindingsOf(element.id)
    };
};

const instanceDescription = element => {
    const self = selfOf(element);
    const kind = resolveKind(self.kind);
    return { chain: kind.ids, data: self.data, operations: operationsOf(kind), slots: slotsOf(self) };
};

export const explain = id => {
    const element = getElement(id);
    const description = element.kind === 'kind' ? kindDescription(element) : instanceDescription(element);
    return { id, kind: element.kind, source: relative(sourceOf(element)), ...description };
};

const json = value => JSON.stringify(value);

const operationLine = ({ name, input, output, declaredBy, implementedBy }) => {
    const origin = implementedBy === undefined ? `abstract, ${declaredBy}`
        : implementedBy === declaredBy ? declaredBy : `${declaredBy}, implemented by ${implementedBy}`;
    return `  ${name}: ${json(input)} -> ${json(output ?? 'any')}  (${origin})`;
};

const slotLines = ({ name, cardinality, value, declaredBy, fills }) => [
    `  ${name} [${cardinality}] ${json(value)}  (${declaredBy})`,
    ...fills.map(fill => `    ${fill.id ?? '-'} on ${fill.target}  ${fill.source ?? ''}`.trimEnd())
];

const lifecycleLine = ({ hook, kinds, value }) => value === undefined
    ? `  ${hook}: ${kinds.join(', ')}`
    : `  ${hook}: ${json(value)}  (${kinds.join(', ')})`;

const section = (title, lines) => lines.length ? [`${title}:`, ...lines] : [];

const isEmpty = value => value === undefined || (typeof value === 'object' && Object.keys(value).length === 0);

const valueLine = (title, value) => isEmpty(value) ? [] : [`${title}: ${json(value)}`];

const listLine = (title, values) => values?.length ? [`${title}: ${values.join(', ')}`] : [];

export const renderExplanation = description => [
    `${description.id}  ${description.kind}  ${description.source ?? ''}`.trimEnd(),
    `chain: ${description.chain.join(' > ')}`,
    ...section('shapes', Object.entries(description.shapes ?? {}).map(([kind, shape]) => `  ${kind}: ${json(shape)}`)),
    ...valueLine('defaults', description.defaults),
    ...valueLine('manages', description.manages),
    ...valueLine('data', description.data),
    ...section('operations', description.operations.map(operationLine)),
    ...section('slots', description.slots.flatMap(slotLines)),
    ...section('lifecycle', (description.lifecycle ?? []).map(lifecycleLine)),
    ...listLine('instances', description.instances),
    ...listLine('bindings', description.bindings)
].join('\n');
