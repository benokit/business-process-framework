import { isEmpty, merge } from 'lodash-es';
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

const collect = (kinds, property, what) => kinds.reduce((all, kind) =>
    Object.entries(kind.data[property] ?? {}).reduce((acc, [name, value]) => name in acc
        ? fail('redefined', `${kind.id} may not redefine ${what} '${name}'`, { kind: kind.id, name })
        : { ...acc, [name]: { ...value, owner: kind.id } }, all), {});

const managedKeys = chain => Object.fromEntries(chain.flatMap(kind =>
    Object.keys(kind.data.context?.manages ?? {}).map(key => [key, kind.id])));

const readKeys = (chain, manages) => new Set([
    ...Object.keys(manages),
    ...chain.flatMap(kind => kind.data.context?.reads ?? [])
]);

export const resolveKind = memo(id => {
    const chain = kindChain(id);
    const ids = chain.map(kind => kind.id);
    const manages = managedKeys(chain);
    return {
        id,
        ids,
        chain,
        operations: collect(chain, 'operations', 'operation'),
        slots: collect([...chain, ...slotDeclarationsFor(ids)], 'slots', 'slot'),
        defaults: merge({}, ...chain.map(kind => kind.data.defaults)),
        manages,
        reads: readKeys(chain, manages)
    };
});

export const selfOf = memo(element => {
    const { defaults } = resolveKind(kindOf(element));
    return Object.freeze({
        id: element.id,
        kind: kindOf(element),
        data: isEmpty(defaults) ? element.data : merge({}, defaults, element.data)
    });
});

export const instancesOf = memo(kindId => allElements().filter(element => extendsKind(kindOf(element), kindId)));

export const isInstanceOf = ({ element, kind }) => {
    const found = findElement(element);
    return found !== undefined && extendsKind(kindOf(found), kind);
};

export const checkKind = self => problemsOf(() => resolveKind(self.id)).map(problem => problem.message);
