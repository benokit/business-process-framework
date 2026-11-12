import { allElements, kindOf } from '../registry.js';
import { resolveKind, selfAt } from '../kinds.js';
import { applyMapping } from '../mappings.js';

const explainers = () => allElements().filter(element => element.id !== undefined).flatMap(element =>
    resolveKind(kindOf(element)).chain.filter(kind => kind.data.lifecycle?.explain !== undefined).map(kind => ({ element, kind: kind.id, mapping: kind.data.lifecycle.explain })));

export const explanationsOf = id => Object.assign({}, ...explainers()
    .map(({ element, kind, mapping }) => applyMapping({ mapping, input: { self: selfAt(element, kind), element: id } }) ?? {}));
