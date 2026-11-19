import { errorTypeOf, isKindOfError } from '@business-framework/core/error-types';
import { selvesOf } from '@business-framework/core/kinds';
import { slotValues } from '@business-framework/core/slots';
import { applyMapping } from '@business-framework/core/mappings';
import { memo } from '@business-framework/core/registry';
import { isDeepStrictEqual } from 'node:util';

export const rolesOf = ({ entities, tasks = {} }) => ({
    ...entities,
    ...Object.fromEntries(Object.entries(tasks).map(([name, { type }]) => [name, { entityType: type, late: true, task: true }]))
});

const evaluated = (mapping, scope) => applyMapping({ mapping, input: scope });

const catchesError = error => entry => !errorTypeOf(error.code).transient && entry.catches.some(code => isKindOfError(error.code, code));

export const processErrorExit = ({ name, step, scope, error, bindings }) => {
    const entry = (step.onError ?? []).find(catchesError(error));
    if (entry === undefined) throw error;
    const failure = { code: error.code, message: error.message, data: error.data };
    return {
        kind: 'next',
        step: entry.then,
        entities: bindings,
        variables: { ...scope.process.data.body, ...entry.set === undefined ? {} : evaluated(entry.set, { ...scope, error: failure }) },
        recovered: name
    };
};

const ENTITY_PATH = /^#\.(?:entities|tasks)\.([^.]+)(?:\.(.*))?$/;

const readsOf = value => typeof value === 'string'
    ? [value.match(ENTITY_PATH)].filter(Boolean).map(([, role, path]) => ({ role, path }))
    : typeof value === 'object' && value !== null ? Object.values(value).flatMap(readsOf) : [];

const conditionsOf = ({ steps }) => Object.values(steps).flatMap(step => step.wait?.when ?? []);

const pathsOf = (reads, many) => many || reads.some(({ path }) => path === undefined) ? null : [...new Set(reads.map(({ path }) => path))];

const viewsOf = memo(entityType => selvesOf('process-definition').flatMap(({ id, data }) => Object.entries(rolesOf(data))
    .filter(([, role]) => role.entityType === entityType)
    .map(([role, { many }]) => ({ name: `${id}/${role}`, reads: conditionsOf(data).flatMap(({ test }) => readsOf(test)).filter(read => read.role === role), many }))
    .filter(({ reads }) => reads.length > 0)
    .map(({ name, reads, many }) => ({ name, paths: pathsOf(reads, many) }))));

const at = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

const viewed = (paths, record) => paths === null ? record?.data : paths.map(path => at(record, path));

export const changedViews = ({ entityType, before, after }) => {
    const names = viewsOf(entityType)
        .filter(({ paths }) => !isDeepStrictEqual(viewed(paths, before), viewed(paths, after)))
        .map(({ name }) => name);
    return names.length === 0 ? null : names;
};

export const extensionsOf = definition => slotValues({ element: definition, slot: 'stepExtensions' });
