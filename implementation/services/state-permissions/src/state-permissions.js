import { findElement } from '@business-framework/core';
import { isInstanceOf, kindChainOf, selvesOf } from '@business-framework/core/kinds';
import { permits } from '@business-framework/authorization/authorization';
import { permissionState, permissionStatesOfType, transitionsOfType } from '@business-framework/entity-states/states';

const SYSTEM = 'system';

const WILDCARD = '*';

const isGoverned = ({ entityType, user, operation }) => user !== undefined && user !== null && user.userId !== SYSTEM
    && operation !== undefined && operation !== null && operation.resource === entityType;

export const deniesState = ({ entityType, user, operation, record }) => {
    if (!record || !isGoverned({ entityType, user, operation })) return false;
    const state = permissionState({ entityType, state: record.data.state ?? {} });
    return state !== null && !permits({ operation: { ...operation, state }, roles: user.roles ?? [] });
};

const QUERY = ['query', 'read', 'search'];

const namesAll = value => value === undefined || [value].flat().includes(WILDCARD);

const reaches = (resource, entityType) => namesAll(resource) || [resource].flat().some(named => named === entityType || kindChainOf(entityType).includes(named));

const entityTypesOf = resource => selvesOf('entity-type').map(({ id }) => id).filter(id => reaches(resource, id));

const stateProblems = (holder, { resource, action, state }) => [
    ...[state].flat().filter(named => named !== WILDCARD && !entityTypesOf(resource).some(id => permissionStatesOfType(id).includes(named)))
        .map(named => `${holder.id}: grants state ${named}, which no entity type it grants declares`),
    ...[action].flat().filter(named => QUERY.includes(named)).flatMap(named => namesAll(state) ? [] : [`${holder.id}: grants state with the action ${named}, which no read checks`])
];

export const stateGrantProblems = () => [...selvesOf('actor'), ...selvesOf('role')]
    .filter(holder => findElement(holder.id))
    .flatMap(holder => (holder.data.grants ?? []).filter(grant => grant.state !== undefined).flatMap(grant => stateProblems(holder, grant)));

const permittingRoles = (entityType, state, operation) => selvesOf('role')
    .filter(({ id }) => permits({ operation: { resource: entityType, state, ...operation }, roles: [id] }))
    .map(({ id }) => id);

const explainedOperations = entityType => [
    ['update', { area: 'entities', action: 'update' }],
    ...transitionsOfType(entityType).map(transition => [transition, { area: 'states', action: transition }])
];

export const statePermissionExplanation = element => findElement(element) && isInstanceOf({ element, kind: 'entity-type' }) && permissionStatesOfType(element).length > 0
    ? {
        statePermissions: Object.fromEntries(permissionStatesOfType(element).map(state => [state, Object.fromEntries(explainedOperations(element)
            .map(([name, operation]) => [name, permittingRoles(element, state, operation)])
            .filter(([, roles]) => roles.length > 0))]))
    }
    : null;
