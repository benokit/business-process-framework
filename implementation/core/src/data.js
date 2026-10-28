import { get, has, isPlainObject, mapValues } from 'lodash-es';
import { getElement } from './registry.js';
import { fail } from './errors.js';
import { readUri } from './packages.js';
import { compose as composeItems } from './composition.js';

const LITERAL = '/literal';
const REF = '/ref';
const MERGE = '/merge';
const URI = '/uri';
const COMPOSED = '/data';

const isComposed = element => COMPOSED in element;

const parseRef = ref => {
    const [id, ...path] = ref.split('/');
    return { id, path };
};

const resolveRef = ref => {
    const { id, path } = parseRef(ref);
    const { data } = getElement(id);
    if (path.length > 0 && !has(data, path)) fail('unknown-ref-path', `'${ref}' has no value at ${path.join('/')}`, { ref, id, path });
    return path.length > 0 ? get(data, path) : data;
};

const refsIn = tree => Array.isArray(tree)
    ? tree.flatMap(refsIn)
    : !isPlainObject(tree) || LITERAL in tree
        ? []
        : REF in tree
            ? [parseRef(tree[REF]).id]
            : Object.values(tree).flatMap(refsIn);

const evaluate = tree => Array.isArray(tree)
    ? tree.map(evaluate)
    : !isPlainObject(tree)
        ? tree
        : LITERAL in tree
            ? tree[LITERAL]
            : REF in tree
                ? resolveRef(tree[REF])
                : URI in tree
                    ? readUri(tree[URI])
                    : MERGE in tree
                        ? composeItems(tree[MERGE].map(evaluate))
                        : mapValues(tree, evaluate);

const dependenciesOf = element => isComposed(element) ? refsIn(element[COMPOSED]).map(getElement) : [];

const visit = (element, path, ordered) => {
    if (ordered.includes(element)) return ordered;
    if (path.includes(element)) {
        fail('data-cycle', `data of '${element.id}' refers to itself`, { path: [...path, element].map(e => e.id) });
    }
    return [...dependenciesOf(element).reduce((acc, dependency) => visit(dependency, [...path, element], acc), ordered), element];
};

const compose = element => {
    if (!isComposed(element)) return;
    if ('data' in element) fail('ambiguous-data', `${element.id} has both 'data' and '/data'`, { id: element.id });
    element.data = evaluate(element[COMPOSED]);
};

export const composeElements = elements => {
    const ordered = elements.reduce((acc, element) => visit(element, [], acc), []);
    ordered.forEach(compose);
    return ordered;
};
