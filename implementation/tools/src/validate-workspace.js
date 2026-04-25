import { loadElements } from '@business-framework/runtime/elements-loader';
import { validateSchema } from '@business-framework/runtime/schema';

function collectSchemaIds(elements) {
    const ids = new Set();
    for (const element of elements) {
        if (element.kind === 'schema' && element.id) {
            ids.add(element.id);
        }
    }
    return ids;
}

// Returns the schema id that matches the element's kind or closest ancestor kind.
function resolveSchemaId(kind, schemaIds) {
    if (!kind) return null;
    const parts = kind.split('/');
    for (let len = parts.length; len > 0; len--) {
        const candidate = parts.slice(0, len).join('/');
        if (schemaIds.has(candidate)) return candidate;
    }
    return null;
}

async function validateWorkspace(paths) {
    const elements = await loadElements(paths);
    const schemaIds = collectSchemaIds(elements);

    const failures = [];

    for (const element of elements) {
        if (element.kind === 'schema') continue;
        // Elements with lazy /data can't be validated statically
        if (!Object.prototype.hasOwnProperty.call(element, 'data')) continue;

        const schemaId = resolveSchemaId(element.kind, schemaIds);
        if (!schemaId) continue;

        // Use a $ref schema so AJV resolves against the already-registered schema
        // without trying to re-compile it under the same $id.
        const { isValid, errors } = validateSchema({ $data: `@${schemaId}` }, element.data);
        if (!isValid) {
            const { file, line } = element._source ?? {};
            failures.push({ element, file, line, schemaId, errors });
        }
    }

    return failures;
}

export { validateWorkspace };
