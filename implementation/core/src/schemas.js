import Ajv from 'ajv';
import { compactToStandard } from '@benokit/js-cjsl';
import { isPlainObject, mapValues, uniqBy } from 'lodash-es';
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

const keyPath = (path, key) => path ? `${path}.${key}` : key;

const codeAt = (schema, value, path) => {
    if (!isPlainObject(schema) || value === undefined) return [];
    if (schema.$ref !== undefined) {
        return CODE.has(schema.$ref) ? [{ type: schema.$ref.slice(1), code: value, path }] : codeAt(storedSchema(schema.$ref), value, path);
    }
    const alternatives = [...schema.allOf ?? [], ...schema.anyOf ?? [], ...schema.oneOf ?? []];
    const properties = schema.properties ?? {};
    return [
        ...alternatives.flatMap(alternative => codeAt(alternative, value, path)),
        ...Array.isArray(value) && schema.items !== undefined ? value.flatMap((item, index) => codeAt(schema.items, item, `${path}[${index}]`)) : [],
        ...isPlainObject(value) ? Object.entries(value).flatMap(([key, item]) => codeAt(properties[key] ?? schema.additionalProperties, item, keyPath(path, key))) : []
    ];
};

export const codeIn = ({ schemaId, value, path = '' }) => uniqBy(codeAt(storedSchema(uri(schemaId)), value, path), 'code');

export const toJsonSchema =({ id, schema }) => compactToStandard({ $id: id, $data: schema });

export const enableChecks = () => {
    checking = true;
};

export const check = (schemaId, value, where) => {
    if (!checking) return;
    const { isValid, errors } = validateValue({ schemaId, value });
    if (!isValid) fail('invalid', `${where}: invalid ${schemaId}`, { schemaId, errors });
};
