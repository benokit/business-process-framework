import Ajv from 'ajv';
import { compactToStandard } from '@benokit/js-cjsl';
import { cloneDeep, isPlainObject, mapValues, set, uniqBy } from 'lodash-es';
import { onReset } from './registry.js';
import { fail } from './errors.js';

const newAjv = () => new Ajv({ allErrors: true });

let ajv = newAjv();
let checking = false;

const withReferences = new Map();
const stubbed = new Set();

onReset(() => {
    ajv = newAjv();
    checking = false;
    withReferences.clear();
    stubbed.clear();
});

const uri = id => `/${id}`;

export const schemaRef = uri;

const absoluteRefs = schema => Array.isArray(schema)
    ? schema.map(absoluteRefs)
    : isPlainObject(schema)
        ? mapValues(schema, (value, key) => key === '$ref' && !value.startsWith('#') ? uri(value) : absoluteRefs(value))
        : schema;

const TEMPLATE = /^\/(mapping|method|type)\/(.+)$/;

const TEMPLATE_BASES = { mapping: { $ref: uri('mapping') }, method: { $ref: uri('method') }, type: {} };

const templateRefsIn = schema => Array.isArray(schema)
    ? schema.flatMap(templateRefsIn)
    : isPlainObject(schema)
        ? Object.entries(schema).flatMap(([key, value]) => key === '$ref' && TEMPLATE.test(value) ? [value] : templateRefsIn(value))
        : [];

const stubTemplate = ref => {
    if (stubbed.has(ref)) return;
    stubbed.add(ref);
    ajv.addSchema(TEMPLATE_BASES[TEMPLATE.exec(ref)[1]], ref);
};

export const addSchema = ({ id, schema }) => {
    const standard = absoluteRefs(compactToStandard({ $data: schema }));
    templateRefsIn(standard).forEach(stubTemplate);
    ajv.addSchema(standard, uri(id));
};

export const add = ({ input }) => addSchema(input);

export const validateValue = ({ schemaId, value }) => {
    const validate = ajv.getSchema(uri(schemaId)) ?? fail('unknown-schema', `unknown schema '${schemaId}'`, { schemaId });
    return { isValid: validate(value), errors: validate.errors ?? [] };
};

const CODE = new Set([uri('method'), uri('mapping')]);

const CODE_TYPES = ['mapping', 'method'];

const REF = uri('ref');

const KIND_REF = `${REF}/kind/`;

export const storedSchema = ref => ajv.getSchema(ref)?.schema;

const keyPath = (path, key) => path ? `${path}.${key}` : key;

const referenceAt = ref => {
    if (ref === REF) return { type: 'ref' };
    if (ref.startsWith(KIND_REF)) return { type: 'ref', kind: 'kind', extending: ref.slice(KIND_REF.length) };
    return ref.startsWith(`${REF}/`) ? { type: 'ref', kind: ref.slice(REF.length + 1) } : undefined;
};

const templateAt = ref => {
    const [, type, template] = TEMPLATE.exec(ref) ?? [];
    return type === undefined ? undefined : { type, template };
};

const typedAt = ref => CODE.has(ref) ? { type: ref.slice(1) } : templateAt(ref) ?? referenceAt(ref);

const isInstanceOfReference = value => isPlainObject(value) && Object.keys(value).length === 1 && typeof value.instanceOf === 'string';

const positionsAt = (schema, value, path) => {
    if (!isPlainObject(schema) || value === undefined) return [];
    if (schema.$ref !== undefined) {
        const typed = typedAt(schema.$ref);
        if (typed?.type === 'ref') return typeof value === 'string' || isInstanceOfReference(value) ? [{ ...typed, code: value, path }] : [];
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

const mentionsReference = (schema, seen = new Set()) => {
    if (Array.isArray(schema)) return schema.some(part => mentionsReference(part, seen));
    if (!isPlainObject(schema)) return false;
    if (typeof schema.$ref !== 'string') return Object.values(schema).some(part => mentionsReference(part, seen));
    const typed = typedAt(schema.$ref);
    if (typed) return typed.type === 'ref';
    if (seen.has(schema.$ref)) return false;
    seen.add(schema.$ref);
    return mentionsReference(storedSchema(schema.$ref), seen);
};

const templateNamesAt = (schema, seen) => {
    if (Array.isArray(schema)) return schema.flatMap(part => templateNamesAt(part, seen));
    if (!isPlainObject(schema)) return [];
    if (typeof schema.$ref !== 'string') return Object.values(schema).flatMap(part => templateNamesAt(part, seen));
    if (TEMPLATE.test(schema.$ref)) return [TEMPLATE.exec(schema.$ref)[2]];
    if (seen.has(schema.$ref)) return [];
    seen.add(schema.$ref);
    return templateNamesAt(storedSchema(schema.$ref), seen);
};

export const templateNamesIn = schemaId => [...new Set(templateNamesAt(storedSchema(uri(schemaId)), new Set()))];

const hasReferences = schemaId => {
    if (!checking) return mentionsReference(storedSchema(uri(schemaId)));
    if (!withReferences.has(schemaId)) withReferences.set(schemaId, mentionsReference(storedSchema(uri(schemaId))));
    return withReferences.get(schemaId);
};

export const resolveReferencesIn = ({ schemaId, value, resolve }) => {
    if (!hasReferences(schemaId)) return value;
    const objects = positionsIn({ schemaId, value }).filter(({ type, kind, code }) => type === 'ref' && kind !== 'kind' && isInstanceOfReference(code));
    if (objects.length === 0) return value;
    const resolved = cloneDeep(value);
    return objects.reduce((result, { path, code }) => path === '' ? resolve(code) : set(result, path, resolve(code)), resolved);
};

export const propertiesOf = schemaId => Object.keys(storedSchema(uri(schemaId))?.properties ?? {});

export const codeIn = options => positionsIn(options).filter(({ type }) => CODE_TYPES.includes(type));

export const toJsonSchema =({ id, schema }) => compactToStandard({ $id: id, $data: schema });

export const standardOf = schema => absoluteRefs(compactToStandard({ $data: schema }));

export const enableChecks = () => {
    checking = true;
};

export const validateWith = ({ schema, value }) => {
    const validate = ajv.compile(standardOf(schema));
    return { isValid: validate(value), errors: validate.errors ?? [] };
};

export const check = (schemaId, value, where) => {
    if (!checking) return;
    const { isValid, errors } = validateValue({ schemaId, value });
    if (!isValid) fail('invalid', `${where}: invalid ${schemaId}`, { schemaId, errors });
};
