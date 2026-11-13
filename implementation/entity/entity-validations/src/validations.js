import { isDeepStrictEqual } from 'node:util';
import { hasOperation, selvesOf } from '@business-framework/core/kinds';
import { traitsOf } from '@business-framework/entities/traits';

export const validationDerivation = ({ record, key, errors, operations }) => isDeepStrictEqual(record.data[key], errors) ? [] : [{ key, operation: 'validate', input: errors }, ...operations];

const requestedBy = ({ onValidation }) => Array.isArray(onValidation) ? onValidation.filter(request => typeof request?.key === 'string' && typeof request?.operation === 'string') : [];

const requestProblems = (entityType, { key, operation }) => {
    const use = traitsOf(entityType)[key];
    return use === undefined
        ? [`${entityType}: onValidation asks for the trait under '${key}', which the entity type doesn't have`]
        : hasOperation({ element: use.trait, operation }) ? [] : [`${entityType}: onValidation asks for the operation '${operation}', which the trait under '${key}' doesn't have`];
};

export const validationProblems = trait => selvesOf('entity-type').flatMap(({ id }) => Object.values(traitsOf(id))
    .filter(use => use.trait === trait)
    .flatMap(({ configuration }) => requestedBy(configuration).flatMap(request => requestProblems(id, request))));
