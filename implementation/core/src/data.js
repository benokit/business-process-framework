import { isPlainObject, mapValues, merge } from 'lodash-es';
import { getElement } from './registry.js';
import { fail } from './errors.js';
import { readUri } from './packages.js';

const LITERAL = '/literal';
const REF = '/ref';
const MERGE = '/merge';
const URI = '/uri';
const COMPOSED = '/data';

const isComposed = element => COMPOSED in element;

const refsIn = tree => Array.isArray(tree)
    ? tree.flatMap(refsIn)
    : !isPlainObject(tree) || LITERAL in tree
        ? []
        : REF in tree
            ? [tree[REF]]
            : Object.values(tree).flatMap(refsIn);

const evaluate = tree => Array.isArray(tree)
    ? tree.map(evaluate)
    : !isPlainObject(tree)
        ? tree
        : LITERAL in tree
            ? tree[LITERAL]
            : REF in tree
                ? getElement(tree[REF]).data
                : URI in tree
                    ? readUri(tree[URI])
                    : MERGE in tree
                        ? merge({}, ...tree[MERGE].map(evaluate))
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
