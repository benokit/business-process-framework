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

const lastOf = timeline => timeline.at(-1);

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

export const startVersions = ({ configuration, body }) => [{ validFrom: keyOf({ configuration, body }), body }];

export const replaceVersions = ({ timeline, configuration, body }) => {
    if (timeline.length > 1) throw conflict('a body with several versions changes by amendments');
    return startVersions({ configuration, body });
};

export const resolveVersion = ({ timeline, at }) => {
    const found = at === undefined || at === null ? timeline.length - 1 : timeline.findLastIndex(({ validFrom }) => validFrom === UNDATED || validFrom <= checkedDate(at));
    if (found < 0) throw new CoreError('not-found', `no version is valid at ${at}`);
    const patches = timeline.slice(found, -1).reverse().map(({ body }) => body);
    return { validFrom: timeline[found].validFrom, data: applyAll(lastOf(timeline).body, patches) };
};

export const patchedBody = ({ body, patch }) => {
    if (!Array.isArray(patch)) throw invalid('a patch is a JSON Patch, an array of operations');
    try {
        return jsonPatch.applyPatch(structuredClone(body), patch, true).newDocument;
    } catch (error) {
        throw invalid(`the patch doesn't apply: ${error.message}`);
    }
};

export const datedBody = ({ configuration, validFrom, body }) => jsonPatch.applyOperation(
    structuredClone(body),
    { op: 'add', path: configuration.versioned.validFrom, value: checkedDate(validFrom) },
    false,
    false
).newDocument;

export const appendVersion = ({ timeline, validFrom, ref, body }) => {
    const last = lastOf(timeline);
    if (last.validFrom === UNDATED) return [{ validFrom: checkedDate(validFrom), ref, body }];
    if (checkedDate(validFrom) < last.validFrom) throw conflict(`${validFrom} is before the last version ${last.validFrom}`);
    return [...timeline.slice(0, -1), { ...last, body: compare(body, last.body) }, { validFrom, ref, body }];
};

export const removeVersion = ({ timeline, validFrom, ref }) => {
    const last = lastOf(timeline);
    if (validFrom !== last.validFrom || ref !== last.ref) throw conflict(`${validFrom} of ${ref} is not the last version ${last.validFrom} of ${last.ref}`);
    if (timeline.length === 1) throw invalid(`the only version ${last.validFrom} can't be removed`);
    const previous = timeline.at(-2);
    return [...timeline.slice(0, -2), { ...previous, body: applyAll(last.body, [previous.body]) }];
};

export const bodyAt = ({ timeline, at }) => resolveVersion({ timeline, at }).data;

const isVersioned = ({ trait }) => isInstanceOf({ element: trait, kind: 'versioned-body-trait' });

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
