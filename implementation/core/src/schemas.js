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

export const toJsonSchema = ({ id, schema }) => compactToStandard({ $id: id, $data: schema });

export const enableChecks = () => {
    checking = true;
};

export const check = (schemaId, value, where) => {
    if (!checking) return;
    const { isValid, errors } = validateValue({ schemaId, value });
    if (!isValid) fail('invalid', `${where}: invalid ${schemaId}`, { schemaId, errors });
};
