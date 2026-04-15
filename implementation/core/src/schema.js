import { compactToStandard } from '@benokit/js-cjsl';
import Ajv from 'ajv';
const ajv = new Ajv();

const compactSchemas = {};

function registerSchema(schema) {
    if (ajv.getSchema(schema.$id)) return;
    if (schema.$id !== undefined) {
        compactSchemas[schema.$id] = schema.$data;
    }
    ajv.addSchema(compactToStandard(schema));
}

function validateSchema(schema, object) {
    const validate = ajv.compile(compactToStandard(schema));
    const validationResult = validate(object);
    return {
        isValid: validationResult,
        errors: validate.errors
    }
}

function resolveSchema(schema) {
    if (typeof schema === 'string' && schema.startsWith('@')) {
        const id = schema.slice(1);
        const $data = compactSchemas[id];
        if ($data === undefined) throw `Schema not found: ${id}`;
        const $locals = {};
        collectRefs($data, $locals);
        const result = { $id: id, $data };
        if (Object.keys($locals).length > 0) result.$locals = $locals;
        return result;
    }

    const $locals = {};
    collectRefs(schema.$data, $locals);
    const result = { ...schema };
    if (Object.keys($locals).length > 0) result.$locals = $locals;
    return result;
}

function collectRefs(data, $locals) {
    if (typeof data === 'string') {
        if (data.startsWith('@') && !data.startsWith('@#')) {
            const id = data.slice(1);
            if (!(id in $locals) && id in compactSchemas) {
                $locals[id] = compactSchemas[id];
                collectRefs(compactSchemas[id], $locals);
            }
        }
    } else if (Array.isArray(data)) {
        for (const item of data) collectRefs(item, $locals);
    } else if (data !== null && typeof data === 'object') {
        for (const value of Object.values(data)) collectRefs(value, $locals);
    }
}

export {
    registerSchema,
    validateSchema,
    resolveSchema
}
