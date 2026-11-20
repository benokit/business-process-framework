import { getElement } from '@business-framework/core';
import { isInstanceOf, selfOf, selvesOf } from '@business-framework/core/kinds';
import { applyMapping } from '@business-framework/core/mappings';
import { schemaRef, storedSchema, validateValue } from '@business-framework/core/schemas';
import { traitsOf } from './traits.js';

export const recordSchema = data => ({
    '!id': 'string',
    '!entityType': 'string',
    '!businessKey': 'string',
    '!revision': 'number',
    '!timestampUtc': 'string',
    '!data': data
});

const bodySchema = ({ trait, configuration }) => isInstanceOf({ element: trait, kind: 'body-trait' }) && configuration.schema !== undefined ? configuration.schema : '@any';

export const valueSchemaOf = ({ entityType, key }) => {
    const use = traitsOf(entityType)[key];
    const mapping = use !== undefined && isInstanceOf({ element: use.trait, kind: 'entity-trait' }) ? selfOf(getElement(use.trait)).data.value : undefined;
    return mapping === undefined ? undefined : applyMapping({ mapping, input: { entityType, key, configuration: use.configuration } });
};

export const dataSchemaOf = ({ entityType }) => Object.fromEntries(Object.entries(traitsOf(entityType))
    .map(([key, use]) => [key, valueSchemaOf({ entityType, key }) ?? bodySchema(use)]));

export const traitValueSchemas = () => selvesOf('entity-type').flatMap(({ id }) => Object.keys(traitsOf(id))
    .map(key => ({ id: `${id}/${key}/value`, schema: valueSchemaOf({ entityType: id, key }) }))
    .filter(({ schema }) => schema !== undefined));

export const recordSchemaOf = options => recordSchema(dataSchemaOf(options));

const isViewed = use => isInstanceOf({ element: use.trait, kind: 'entity-trait' }) && selfOf(getElement(use.trait)).data.view !== undefined;

const checkedUse = (entityType, key) => {
    const use = traitsOf(entityType)[key];
    return use !== undefined && !isViewed(use) && storedSchema(schemaRef(`${entityType}/${key}/value`)) !== undefined;
};

export const traitValueProblems = ({ entityType, data }) => Object.entries(data ?? {})
    .filter(([key]) => checkedUse(entityType, key))
    .flatMap(([key, value]) => validateValue({ schemaId: `${entityType}/${key}/value`, value }).errors
        .map(error => `${key}${error.instancePath} ${error.message}`));
