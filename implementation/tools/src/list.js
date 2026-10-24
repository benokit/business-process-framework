import path from 'path';
import { getElement } from '@business-framework/core';
import { allElements, instancesOf, sourceOf } from '@business-framework/core/introspection';

const elementsOf = kind => kind === undefined ? allElements() : (getElement(kind), instancesOf(kind));

export const list = kind => elementsOf(kind)
    .filter(element => element.id !== undefined)
    .map(element => ({ id: element.id, kind: element.kind, source: path.relative(process.cwd(), sourceOf(element) ?? '') }));

export const renderList = elements => elements.map(({ id, kind, source }) => `${id}  ${kind}  ${source}`.trimEnd()).join('\n');
