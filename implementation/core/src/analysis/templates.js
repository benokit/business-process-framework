import { isPlainObject } from 'lodash-es';
import { findElement, kindOf } from '../registry.js';
import { instancesOf, resolveKind, selfAt } from '../kinds.js';
import { applyMapping } from '../mappings.js';
import { templateNamesIn } from '../schemas.js';
import { problem } from './code.js';

const targetsOf = author => {
    if (author.kind !== 'slot-fill') return [author];
    const target = findElement(author.data.target);
    return target?.kind === 'kind' ? instancesOf(target.id).filter(({ id }) => id !== undefined) : [target];
};

const resolveFor = (element, name) => {
    const template = element === undefined ? undefined : resolveKind(kindOf(element)).templates[name];
    if (template === undefined) return { code: 'unresolved-template', message: `no template '${name}' in ${element === undefined ? 'the target' : kindOf(element)} or its parents` };
    try {
        const value = applyMapping({ mapping: template.mapping, input: { id: element.id, data: selfAt(element, template.owner).data } });
        return isPlainObject(value) || typeof value === 'string' ? { value } : { code: 'invalid-template', message: `template '${name}' resolves to neither a schema nor an input and output` };
    } catch (error) {
        return { code: 'template-failed', message: `template '${name}' failed: ${error.message}` };
    }
};

export const resolveTemplate = (author, name) => targetsOf(author).map(element => resolveFor(element, name));

const usedBy = kind => {
    const { slots } = resolveKind(kind.id);
    const shape = kind.data.shape === undefined ? undefined : kind.id;
    const slotIds = Object.entries(slots).filter(([, { owner }]) => owner === kind.id)
        .flatMap(([name, { input }]) => [`${kind.id}/slots/${name}`, ...input === undefined ? [] : [`${kind.id}/slots/${name}/input`]]);
    return [...shape === undefined ? [] : [{ path: 'shape', schemaId: shape }], ...slotIds.map(schemaId => ({ path: schemaId.slice(kind.id.length + 1), schemaId }))];
};

export const undeclaredTemplateProblems = author => author.kind !== 'kind' ? [] : usedBy(author).flatMap(({ path, schemaId }) =>
    templateNamesIn(schemaId)
        .filter(name => resolveKind(author.id).templates[name] === undefined)
        .map(name => problem({ author }, path, 'unresolved-template', `the schema names the template '${name}', which no kind of ${author.id}'s chain declares`)));
