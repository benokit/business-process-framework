import { isDeepStrictEqual } from 'node:util';
import { getElement } from '@business-framework/core';
import { hasOperation, selfOf, selvesOf } from '@business-framework/core/kinds';
import { fillsOf } from '@business-framework/core/slots';
import { mappingType } from '@business-framework/core/data-flow';
import { traitsOf } from '@business-framework/entities/traits';
import { unlistedReadProblems } from '@business-framework/entities/dependencies';

export const validationDerivation = ({ record, key, errors, operations }) => isDeepStrictEqual(record.data[key], errors) ? [] : [{ key, operation: 'validate', input: errors }, ...operations];

const requestedBy = ({ onValidation }) => Array.isArray(onValidation) ? onValidation.filter(request => typeof request?.key === 'string' && typeof request?.operation === 'string') : [];

const requestProblems = (entityType, { key, operation }) => {
    const use = traitsOf(entityType)[key];
    return use === undefined
        ? [`${entityType}: onValidation asks for the trait under '${key}', which the entity type doesn't have`]
        : hasOperation({ element: use.trait, operation }) ? [] : [`${entityType}: onValidation asks for the operation '${operation}', which the trait under '${key}' doesn't have`];
};

const validationFillsOf = entityType => fillsOf(selfOf(getElement(entityType)), 'validations').fills;

const validationRulesOf = entityType => validationFillsOf(entityType).map(({ data: { value } }) => value);

const namesOfType = type => [...Object.keys(type?.properties ?? {}), ...[...type?.anyOf ?? [], ...type?.oneOf ?? []].flatMap(namesOfType)];

const errorNamesOf = value => [...new Set(namesOfType(mappingType(value, { type: 'object' }).type))];

const collisionProblems = entityType => Object.entries(Object.groupBy(
    validationFillsOf(entityType).flatMap(({ id, data: { value } }) => errorNamesOf(value).map(name => ({ name, id }))),
    ({ name }) => name
))
    .filter(([, givers]) => givers.length > 1)
    .map(([name, givers]) => `${entityType}: the validations ${givers.map(({ id }) => id).join(' and ')} can all give the error '${name}', and the later one overwrites the others`);

export const validationProblems = trait => selvesOf('entity-type').flatMap(({ id }) => Object.entries(traitsOf(id))
    .filter(([, use]) => use.trait === trait)
    .flatMap(([key, { configuration, dependsOn }]) => [
        ...requestedBy(configuration).flatMap(request => requestProblems(id, request)),
        ...unlistedReadProblems({ entityType: id, key, dependsOn, rule: 'validations', mappings: validationRulesOf(id) }),
        ...collisionProblems(id)
    ]));
