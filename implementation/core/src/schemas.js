import Ajv from 'ajv';
import { compactToStandard } from '@benokit/js-cjsl';
import { isPlainObject, mapValues } from 'lodash-es';
import { onReset } from './registry.js';
import { fail } from './errors.js';

const newAjv = () => new Ajv({ allErrors: true });

let ajv = newAjv();
let checking = false;

onReset(() => {
    ajv = newAjv();
    checking = false;
});

const uri = id => `/${id}`;

const absoluteRefs = schema => Array.isArray(schema)
    ? schema.map(absoluteRefs)
    : isPlainObject(schema)
        ? mapValues(schema, (value, key) => key === '$ref' && !value.startsWith('#') ? uri(value) : absoluteRefs(value))
        : schema;

export const addSchema = ({ id, schema }) => {
    ajv.addSchema(absoluteRefs(compactToStandard({ $data: schema })), uri(id));
};

export const add = ({ input }) => addSchema(input);

export const validateValue = ({ schemaId, value }) => {
    const validate = ajv.getSchema(uri(schemaId)) ?? fail('unknown-schema', `unknown schema '${schemaId}'`, { schemaId });
    return { isValid: validate(value), errors: validate.errors ?? [] };
};

const CODE = new Set([uri('method'), uri('mapping')]);

const storedSchema = ref => ajv.getSchema(ref)?.schema;

const codeAt = (schema, value) => {
    if (!isPlainObject(schema) || value === undefined) return [];
    if (schema.$ref !== undefined) return CODE.has(schema.$ref) ? [value] : codeAt(storedSchema(schema.$ref), value);
    const alternatives = [...schema.allOf ?? [], ...schema.anyOf ?? [], ...schema.oneOf ?? []];
    const properties = schema.properties ?? {};
    return [
        ...alternatives.flatMap(alternative => codeAt(alternative, value)),
        ...Array.isArray(value) && schema.items !== undefined ? value.flatMap(item => codeAt(schema.items, item)) : [],
        ...isPlainObject(value) ? Object.entries(value).flatMap(([key, item]) => codeAt(properties[key] ?? schema.additionalProperties, item)) : []
    ];
};

export const codeIn = ({ schemaId, value }) => [...new Set(codeAt(storedSchema(uri(schemaId)), value))];

export const toJsonSchema =({ id, schema }) => compactToStandard({ $id: id, $data: schema });

export const enableChecks = () => {
    checking = true;
};

export const check = (schemaId, value, where) => {
    if (!checking) return;
    const { isValid, errors } = validateValue({ schemaId, value });
    if (!isValid) fail('invalid', `${where}: invalid ${schemaId}`, { schemaId, errors });
};
