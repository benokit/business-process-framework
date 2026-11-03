import { getElement } from '@business-framework/core';
import { selvesOf } from '@business-framework/core/kinds';
import { slotValues } from '@business-framework/core/slots';
import { standardOf } from '@business-framework/core/schemas';
import { mappingType } from '@business-framework/core/data-flow';
import { traitsOf } from '@business-framework/entities/traits';

const bodyType = entityType => {
    const schema = traitsOf(entityType).body?.configuration.schema;
    return schema === undefined ? {} : standardOf(schema);
};

const traitType = (entityType, key) => {
    if (key === 'body') return bodyType(entityType);
    return key === 'amendment-link' ? standardOf(getElement('amendment-link-value').data) : {};
};

const recordType = entityType => ({
    type: 'object',
    properties: {
        entityType: { type: 'string' },
        businessKey: { type: 'string' },
        revision: { type: 'integer' },
        data: {
            type: 'object',
            properties: Object.fromEntries(Object.keys(traitsOf(entityType)).map(key => [key, traitType(entityType, key)])),
            additionalProperties: false
        }
    },
    additionalProperties: false
});

const inputType = input => input === undefined ? {} : standardOf(getElement(input).data);

const mappingProblems = (code, scope, label) => mappingType(code, scope).problems
    .filter(problem => problem.code === 'unknown-path')
    .map(problem => `${label} ${problem.message}`);

const fillProblems = (entityType, { type, open, apply, input }) => [
    ...open === undefined ? [] : mappingProblems(open, { type: 'object', properties: { entity: recordType(entityType), input: inputType(input) }, additionalProperties: false }, `${entityType}: the open mapping of ${type}`),
    ...apply === undefined ? [] : mappingProblems(apply, { type: 'object', properties: { body: bodyType(entityType), amendment: recordType(type) }, additionalProperties: false }, `${entityType}: the apply mapping of ${type}`)
];

export const amendmentFillProblems = () => selvesOf('versioned-entity-type')
    .flatMap(({ id }) => slotValues({ element: id, slot: 'amendmentTypes' })
        .filter(fill => typeof fill === 'object')
        .flatMap(fill => fillProblems(id, fill)));
