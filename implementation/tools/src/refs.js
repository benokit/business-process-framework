import path from 'path';
import { getElement } from '@business-framework/core';
import { allElements, referencesOf, sourceOf } from '@business-framework/core/introspection';

const relative = file => file && path.relative(process.cwd(), file);

const nameOf = element => element.id ?? (element.kind === 'slot-fill' ? `(fill of ${element.data.slot} on ${element.data.target})` : `(a ${element.kind})`);

export const refs = id => {
    getElement(id);
    return allElements().flatMap(element => referencesOf(element)
        .filter(({ to }) => to === id)
        .map(({ path, via }) => ({ element: nameOf(element), path, via, source: relative(sourceOf(element)) })));
};

export const renderRefs = references => references.length === 0 ? 'no references'
    : references.map(({ element, path, via, source }) => `${element} ${path} (${via})  ${source ?? ''}`.trimEnd()).join('\n');
