import jsonPatch from 'fast-json-patch';
import { CoreError } from '@business-framework/core';
import { isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { schemaRef, storedSchema } from '@business-framework/core/schemas';
import { applyAll, compare } from './patch.js';
import { traitsOf } from './traits.js';

export const UNDATED = 'undated';

const invalid = message => new CoreError('invalid', message);

const conflict = message => new CoreError('conflict', message);

const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

const checkedDate = value => {
    if (!isDate(value)) throw invalid(`'${value}' is not a date YYYY-MM-DD`);
    return value;
};

const sortedKeys = timeline => Object.keys(timeline).sort((left, right) => (left === UNDATED ? -1 : right === UNDATED ? 1 : left < right ? -1 : left > right ? 1 : 0));

const lastKey = timeline => sortedKeys(timeline).at(-1);

const without = (timeline, key) => Object.fromEntries(Object.entries(timeline).filter(([other]) => other !== key));

const valueAt = (body, pointer) => {
    try {
        return jsonPatch.getValueByPointer(body, pointer);
    } catch {
        return undefined;
    }
};

const keyOf = ({ configuration, body }) => {
    const validFrom = valueAt(body, configuration.versioned.validFrom);
    return validFrom === undefined || validFrom === null ? UNDATED : checkedDate(validFrom);
};

export const startVersions = ({ configuration, body }) => ({ [keyOf({ configuration, body })]: body });

export const replaceVersions = ({ timeline, configuration, body }) => {
    if (Object.keys(timeline).length > 1) throw conflict('a body with several versions changes by amendments');
    return startVersions({ configuration, body });
};

export const resolveVersion = ({ timeline, at }) => {
    const keys = sortedKeys(timeline);
    const found = at === undefined || at === null ? keys.length - 1 : keys.findLastIndex(key => key === UNDATED || key <= checkedDate(at));
    if (found < 0) throw new CoreError('not-found', `no version is valid at ${at}`);
    const patches = keys.slice(found, -1).reverse().map(key => timeline[key]);
    return { validFrom: keys[found], data: applyAll(timeline[keys.at(-1)], patches) };
};

const patched = (document, patch) => {
    if (!Array.isArray(patch)) throw invalid('an amendment is a JSON Patch, an array of operations');
    try {
        return jsonPatch.applyPatch(structuredClone(document), patch, true).newDocument;
    } catch (error) {
        throw invalid(`the patch doesn't apply: ${error.message}`);
    }
};

export const amendedBody = ({ timeline, configuration, validFrom, patch }) => jsonPatch.applyOperation(
    patched(resolveVersion({ timeline }).data, patch),
    { op: 'add', path: configuration.versioned.validFrom, value: checkedDate(validFrom) },
    false,
    false
).newDocument;

const replacedLast = ({ timeline, last, body }) => {
    const previous = sortedKeys(timeline).at(-2);
    return previous === undefined
        ? { [last]: body }
        : { ...timeline, [previous]: compare(body, applyAll(timeline[last], [timeline[previous]])), [last]: body };
};

export const appendVersion = ({ timeline, validFrom, body }) => {
    const last = lastKey(timeline);
    if (last === UNDATED) return { [checkedDate(validFrom)]: body };
    if (checkedDate(validFrom) < last) throw conflict(`${validFrom} is before the last version ${last}`);
    if (validFrom === last) return replacedLast({ timeline, last, body });
    return { ...timeline, [last]: compare(body, timeline[last]), [validFrom]: body };
};

export const removeVersion = ({ timeline, validFrom }) => {
    const last = lastKey(timeline);
    if (validFrom !== last) throw conflict(`${validFrom} is not the last version ${last}`);
    const previous = sortedKeys(timeline).at(-2);
    if (previous === undefined) throw invalid(`the only version ${last} can't be removed`);
    return { ...without(timeline, last), [previous]: applyAll(timeline[last], [timeline[previous]]) };
};

const isVersioned = use => isInstanceOf({ element: use.trait, kind: 'body-trait' }) && use.configuration.versioned !== undefined;

export const resolvedRecord = ({ record, entityType, at }) => {
    const versioned = Object.entries(traitsOf(record.entityType ?? entityType)).filter(([, use]) => isVersioned(use)).map(([key]) => key);
    return versioned.length === 0
        ? record
        : { ...record, data: { ...record.data, ...Object.fromEntries(versioned.map(key => [key, resolveVersion({ timeline: record.data[key], at }).data])) } };
};

export const resolvedChange = ({ change, entityType }) => Object.fromEntries(Object.entries(change)
    .map(([key, value]) => [key, ['before', 'after'].includes(key) && value?.data !== undefined ? resolvedRecord({ record: value, entityType }) : value]));

export const recordVersions = ({ record }) => Object.fromEntries(Object.entries(traitsOf(record.entityType))
    .filter(([, use]) => isVersioned(use))
    .map(([key]) => [key, lastKey(record.data[key])]));

const propertiesNamed = (schema, name) => {
    if (schema === null || typeof schema !== 'object') return [];
    if (schema.$ref !== undefined) return propertiesNamed(storedSchema(schema.$ref), name);
    return [...(schema.properties?.[name] === undefined ? [] : [schema.properties[name]]), ...[...schema.allOf ?? [], ...schema.anyOf ?? [], ...schema.oneOf ?? []].flatMap(inner => propertiesNamed(inner, name))];
};

const resolvedSchema = schema => schema?.$ref === undefined ? schema : resolvedSchema(storedSchema(schema.$ref));

const isDateSchema = schema => resolvedSchema(schema)?.type === 'string' && (resolvedSchema(schema).pattern === undefined || new RegExp(resolvedSchema(schema).pattern).test('2000-01-01'));

const pointerProblems = (entityType, key, { versioned: { validFrom } }) => {
    const names = validFrom.split('/').slice(1).map(name => name.replaceAll('~1', '/').replaceAll('~0', '~'));
    const candidates = names.reduce((schemas, name) => schemas.flatMap(inner => propertiesNamed(inner, name)), [storedSchema(schemaRef(`${entityType}/${key}/schema`))]);
    if (candidates.length === 0) return [`${entityType}: the pointer '${validFrom}' of the versioned ${key} is no field of its schema`];
    return candidates.some(isDateSchema) ? [] : [`${entityType}: the field '${validFrom}' of the versioned ${key} is no date (a string that matches YYYY-MM-DD)`];
};

export const versionedBodyProblems = () => selvesOf('entity-type').flatMap(({ id }) => Object.entries(traitsOf(id))
    .filter(([, use]) => isVersioned(use))
    .flatMap(([key, { configuration }]) => pointerProblems(id, key, configuration)));
