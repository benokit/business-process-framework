import { allElements, kindOf } from '../registry.js';
import { resolveKind, selfOf } from '../kinds.js';
import { applyMapping } from '../mappings.js';

const explainers = () => allElements().filter(element => element.id !== undefined).flatMap(element =>
    resolveKind(kindOf(element)).chain.filter(kind => kind.data.lifecycle?.explain !== undefined).map(kind => ({ element, mapping: kind.data.lifecycle.explain })));

export const explanationsOf = id => Object.assign({}, ...explainers()
    .map(({ element, mapping }) => applyMapping({ mapping, input: { self: selfOf(element), element: id } }) ?? {}));
