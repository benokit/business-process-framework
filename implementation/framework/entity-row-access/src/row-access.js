import { findElement, getElement } from '@business-framework/core';
import { extendsKind, isInstanceOf, kindChainOf, selfOf, selvesOf } from '@business-framework/core/kinds';
import { applyMapping } from '@business-framework/core/mappings';
import { bindRows, ownershipRule } from '@business-framework/entity-ownership/ownership';

const SYSTEM = 'system';

const WILDCARD = '*';

const profileOf = id => selfOf(getElement(id)).data;

const profilesWithin = (id, path = []) => path.includes(id) || !findElement(id)
    ? []
    : [...new Set([id, ...(profileOf(id).profiles ?? []).flatMap(included => profilesWithin(included, [...path, id]))])];

const namesAll = value => value === undefined || [value].flat().includes(WILDCARD);

const reaches = (resource, entityType) => namesAll(resource) || [resource].flat().some(named => named === entityType || kindChainOf(entityType).includes(named));

const filterOf = scope => findElement(scope) ? selfOf(getElement(scope)).data.filter : undefined;

const filtersOf = scopes => [scopes ?? []].flat().filter(named => named !== WILDCARD).map(filterOf).filter(filter => filter !== undefined);

const anyOf = filters => filters.length === 1 ? filters[0] : { $or: filters };

const rowsOf = ({ scopes, except = [] }) => {
    const listed = namesAll(scopes) ? [] : filtersOf(scopes);
    const excluded = except.flatMap(({ scopes: excepted }) => filtersOf(excepted));
    const parts = [...listed.length > 0 ? [anyOf(listed)] : [], ...excluded.length > 0 ? [{ $not: anyOf(excluded) }] : []];
    return parts.length === 0 ? true : parts.length === 1 ? parts[0] : { $and: parts };
};

const unique = rows => [...new Map(rows.map(row => [JSON.stringify(row), row])).values()];

export const rowAccess = ({ entityType, profiles }) => {
    const granted = unique(profiles.flatMap(id => profilesWithin(id))
        .flatMap(id => profileOf(id).permissions ?? [])
        .filter(({ resource }) => reaches(resource, entityType))
        .map(rowsOf));
    return granted.length === 0 ? null : granted.includes(true) ? true : anyOf(granted);
};

const isGoverned = ({ entityType, user }) => user !== undefined && user !== null && user.userId !== SYSTEM && ownershipRule(entityType) !== null;

const coverageOf = ({ entityType, user }) => bindRows({ rows: rowAccess({ entityType, profiles: user.access ?? [] }), principal: user });

const covers = (rows, record) => typeof rows === 'boolean' ? rows : applyMapping({ mapping: rows, input: { ownership: record.data.ownership } });

export const deniesRecord = ({ entityType, user, record }) => {
    if (!record || !isGoverned({ entityType, user })) return false;
    const rows = coverageOf({ entityType, user });
    return rows === null || !covers(rows, record);
};

export const searchRows = ({ entityType, user }) => {
    if (!isGoverned({ entityType, user })) return null;
    const rows = coverageOf({ entityType, user });
    return rows === null ? false : rows === true ? null : rows;
};

const isEntityTypeOrClass = id => findElement(id).kind === 'kind' ? extendsKind(id, 'entity-type') : isInstanceOf({ element: id, kind: 'entity-type' });

const resourceProblems = (profile, { resource }) => namesAll(resource) ? [] : [resource].flat()
    .filter(named => !findElement(named) || !isEntityTypeOrClass(named))
    .map(named => `${profile}: gives access to ${named}, which is no entity type or class of entity types`);

const scopeProblems = (profile, scopes) => [scopes ?? []].flat()
    .filter(named => named !== WILDCARD && !(findElement(named) && isInstanceOf({ element: named, kind: 'ownership-scope' })))
    .map(named => `${profile}: gives access to the rows of ${named}, which is not a scope`);

const cycleThrough = (start, id = start, path = []) => {
    if (path.length > 0 && id === start) return [...path, id];
    if (path.includes(id) || !findElement(id)) return undefined;
    return (profileOf(id).profiles ?? []).map(included => cycleThrough(start, included, [...path, id])).find(Boolean);
};

export const accessProfileProblems = profile => [
    ...(profileOf(profile).permissions ?? []).flatMap(permission => [
        ...resourceProblems(profile, permission),
        ...scopeProblems(profile, permission.scopes),
        ...(permission.except ?? []).flatMap(({ scopes }) => scopeProblems(profile, scopes))
    ]),
    ...[cycleThrough(profile)].filter(Boolean).map(cycle => `${profile}: includes itself through ${cycle.join(' > ')}`)
];

const profilesReaching = entityType => selvesOf('access-profile')
    .filter(({ id }) => profilesWithin(id).some(within => (profileOf(within).permissions ?? []).some(({ resource }) => reaches(resource, entityType))))
    .map(({ id }) => id);

const profilesNaming = scope => selvesOf('access-profile')
    .filter(({ data }) => (data.permissions ?? []).some(({ scopes, except = [] }) => [scopes, ...except.map(entry => entry.scopes)].flat(2).includes(scope)))
    .map(({ id }) => id);

export const accessExplanation = element => {
    if (!findElement(element)) return null;
    if (isInstanceOf({ element, kind: 'ownership-scope' })) return { access: { profiles: profilesNaming(element) } };
    if (isInstanceOf({ element, kind: 'entity-type' }) && ownershipRule(element) !== null) return { access: { profiles: profilesReaching(element) } };
    return null;
};

