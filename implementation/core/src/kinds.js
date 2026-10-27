import { isEmpty, isEqual, isPlainObject } from 'lodash-es';
import { allElements, findElement, kindOf, memo } from './registry.js';
import { fail, problemsOf } from './errors.js';

const kindElement = id => {
    const element = findElement(id);
    return element?.kind === 'kind' ? element : fail('unknown-kind', `unknown kind '${id}'`, { id });
};

const chainFrom = (id, visited) => {
    if (visited.includes(id)) fail('kind-cycle', `kind '${id}' extends itself`, { id, path: visited });
    const kind = kindElement(id);
    return [...(kind.data.extends ? chainFrom(kind.data.extends, [...visited, id]) : []), kind];
};

export const kindChain = memo(id => chainFrom(id, []));

export const extendsKind = (kindId, ancestorId) => kindChain(kindId).some(kind => kind.id === ancestorId);

const slotDeclarationsFor = ids => instancesOf('slot-declaration')
    .filter(element => ids.includes(element.data.target))
    .map(({ data: { target, slot, ...declaration } }) => ({ id: target, data: { slots: { [slot]: declaration } } }));

const isImplementation = (inherited, value) => inherited.implementation === undefined
    && Object.keys(value).every(key => key === 'implementation');

const added = (kind, what, name, value) => what === 'operation' && value.input === undefined
    ? fail('missing-contract', `${kind.id}: operation '${name}' implements nothing and declares no input`, { kind: kind.id, name })
    : { ...value, owner: kind.id };

const entry = (kind, what, acc, name, value) => {
    if (!(name in acc)) return added(kind, what, name, value);
    if (what === 'operation' && isImplementation(acc[name], value)) return { ...acc[name], implementation: value.implementation };
    return fail('redefined', `${kind.id} may not redefine ${what} '${name}'`, { kind: kind.id, name });
};

const collect = (kinds, property, what) => kinds.reduce((all, kind) =>
    Object.entries(kind.data[property] ?? {}).reduce((acc, [name, value]) =>
        ({ ...acc, [name]: entry(kind, what, acc, name, value) }), all), {});

const managedKeys = chain => Object.fromEntries(chain.flatMap(kind =>
    Object.keys(kind.data.context?.manages ?? {}).map(key => [key, kind.id])));

const unite = (base, over, owner, path = []) => {
    if (isPlainObject(base) && isPlainObject(over)) {
        return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(over)])]
            .map(key => [key, key in over ? (key in base ? unite(base[key], over[key], owner, [...path, key]) : over[key]) : base[key]]));
    }
    return isEqual(base, over) ? base : fail('fixed-conflict', `${owner} can't change the fixed value at '${path.join('.')}'`, { owner, path });
};

export const resolveKind = memo(id => {
    const chain = kindChain(id);
    const ids = chain.map(kind => kind.id);
    return {
        id,
        ids,
        chain,
        operations: collect(chain, 'operations', 'operation'),
        slots: collect([...chain, ...slotDeclarationsFor(ids)], 'slots', 'slot'),
        fixed: chain.reduce((fixed, kind) => unite(fixed, kind.data.fixed ?? {}, kind.id), {}),
        manages: managedKeys(chain)
    };
});

export const selfOf = memo(element => {
    const { fixed } = resolveKind(kindOf(element));
    return Object.freeze({
        id: element.id,
        kind: kindOf(element),
        data: isEmpty(fixed) ? element.data : unite(fixed, element.data, element.id)
    });
});

export const instancesOf = memo(kindId => allElements().filter(element => extendsKind(kindOf(element), kindId)));

export const selvesOf = kind => instancesOf(kind).filter(element => element.id !== undefined).map(selfOf);

export const isInstanceOf = ({ element, kind }) => {
    const found = findElement(element);
    return found !== undefined && extendsKind(kindOf(found), kind);
};

export const hasOperation = ({ element, operation }) => {
    const found = findElement(element);
    return found === undefined || operation in resolveKind(kindOf(found)).operations;
};

export const kindChainOf = id => {
    const element = findElement(id);
    if (element === undefined) return [];
    const chain = element.kind === 'kind' ? kindChain(id).slice(0, -1) : kindChain(kindOf(element));
    return chain.map(kind => kind.id).reverse();
};

export const checkKind = self => problemsOf(() => resolveKind(self.id)).map(problem => problem.message);
