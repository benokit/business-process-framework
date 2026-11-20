import { isDeepStrictEqual } from 'node:util';
import { compactType, mappingType } from '@business-framework/core/data-flow';
import { selvesOf } from '@business-framework/core/kinds';
import { memo } from '@business-framework/core/registry';
import { scopeSchema } from './scopes.js';
import { rolesOf } from './process.js';

const conditionsOf = ({ steps }) => Object.values(steps).flatMap(step => step.wait?.when ?? []);

const readsOf = (data, { test }) => mappingType(test, compactType(scopeSchema({ definition: data, position: 'step' }))).reads ?? [[]];

const readsOfRole = (reads, scope, role) => reads.flatMap(read => read.length === 0 || (read.length === 1 && read[0] === scope)
    ? [[]]
    : read[0] === scope && read[1] === role ? [read.slice(2)] : []);

const pathsOf = (reads, many) => many || reads.some(read => read.length === 0) ? null : [...new Set(reads.map(read => read.join('.')))];

const viewsOf = memo(entityType => selvesOf('process-definition').flatMap(({ id, data }) => {
    const reads = conditionsOf(data).flatMap(condition => readsOf(data, condition));
    return Object.entries(rolesOf(data))
        .filter(([, role]) => role.entityType === entityType)
        .map(([role, { many, task }]) => ({ name: `${id}/${role}`, reads: readsOfRole(reads, task ? 'tasks' : 'entities', role), many }))
        .filter(({ reads: ofRole }) => ofRole.length > 0)
        .map(({ name, reads: ofRole, many }) => ({ name, paths: pathsOf(ofRole, many) }));
}));

const at = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

const viewed = (paths, record) => paths === null ? record?.data : paths.map(path => at(record, path));

export const changedViews = ({ entityType, before, after }) => {
    const names = viewsOf(entityType)
        .filter(({ paths }) => !isDeepStrictEqual(viewed(paths, before), viewed(paths, after)))
        .map(({ name }) => name);
    return names.length === 0 ? null : names;
};
