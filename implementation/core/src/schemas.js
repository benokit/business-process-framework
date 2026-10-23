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

const REF = uri('ref');

const KIND_REF = `${REF}/kind/`;

const storedSchema = ref => ajv.getSchema(ref)?.schema;

const keyPath = (path, key) => path ? `${path}.${key}` : key;

const referenceAt = ref => {
    if (ref === REF) return { type: 'ref' };
    if (ref.startsWith(KIND_REF)) return { type: 'ref', kind: 'kind', extending: ref.slice(KIND_REF.length) };
    return ref.startsWith(`${REF}/`) ? { type: 'ref', kind: ref.slice(REF.length + 1) } : undefined;
};

const typedAt = ref => CODE.has(ref) ? { type: ref.slice(1) } : referenceAt(ref);

const positionsAt = (schema, value, path) => {
    if (!isPlainObject(schema) || value === undefined) return [];
    if (schema.$ref !== undefined) {
        const typed = typedAt(schema.$ref);
        return typed ? [{ ...typed, code: value, path }] : positionsAt(storedSchema(schema.$ref), value, path);
    }
    const alternatives = [...schema.allOf ?? [], ...schema.anyOf ?? [], ...schema.oneOf ?? []];
    const properties = schema.properties ?? {};
    return [
        ...alternatives.flatMap(alternative => positionsAt(alternative, value, path)),
        ...Array.isArray(value) && schema.items !== undefined ? value.flatMap((item, index) => positionsAt(schema.items, item, `${path}[${index}]`)) : [],
        ...isPlainObject(value) ? Object.entries(value).flatMap(([key, item]) => positionsAt(properties[key] ?? schema.additionalProperties, item, keyPath(path, key))) : []
    ];
};

export const positionsIn = ({ schemaId, value, path = '' }) => uniqBy(positionsAt(storedSchema(uri(schemaId)), value, path), 'path');

export const propertiesOf = schemaId => Object.keys(storedSchema(uri(schemaId))?.properties ?? {});

export const codeIn = options => positionsIn(options).filter(({ type }) => type !== 'ref');

export const toJsonSchema =({ id, schema }) => compactToStandard({ $id: id, $data: schema });

export const enableChecks = () => {
    checking = true;
};

export const check = (schemaId, value, where) => {
    if (!checking) return;
    const { isValid, errors } = validateValue({ schemaId, value });
    if (!isValid) fail('invalid', `${where}: invalid ${schemaId}`, { schemaId, errors });
};
