import { isPlainObject } from 'lodash-es';
import { findElement, kindOf } from '../registry.js';
import { resolveKind, selfAt } from '../kinds.js';
import { applyMapping } from '../mappings.js';

const targetOf = element => element.kind === 'slot-fill' ? findElement(element.data.target) : element;

export const resolveTemplate = (author, name) => {
    const element = targetOf(author);
    const template = element === undefined ? undefined : resolveKind(kindOf(element)).templates[name];
    if (template === undefined) return { code: 'unresolved-template', message: `no template '${name}' in ${element === undefined ? 'the target' : kindOf(element)} or its parents` };
    try {
        const value = applyMapping({ mapping: template.mapping, input: { id: element.id, data: selfAt(element, template.owner).data } });
        return isPlainObject(value) || typeof value === 'string' ? { value } : { code: 'invalid-template', message: `template '${name}' resolves to neither a schema nor an input and output` };
    } catch (error) {
        return { code: 'template-failed', message: `template '${name}' failed: ${error.message}` };
    }
};
