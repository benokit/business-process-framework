import { getElement } from '@business-framework/core';
import { resolveKind, selvesOf, isInstanceOf } from '@business-framework/core/kinds';
import { standardOf } from '@business-framework/core/schemas';
import { mappingType } from '@business-framework/core/data-flow';
import { traitsOf } from '@business-framework/entities/traits';

const DEFAULT_REVERT_KEYS = ['body'];

const CHECKED = ['unknown-path', 'type-mismatch', 'missing-property', 'unknown-property'];

const bodyType = entityType => {
    const schema = traitsOf(entityType).body?.configuration.schema;
    return schema === undefined ? {} : standardOf(schema);
};

const recordType = entityType => ({
    type: 'object',
    properties: {
        entityType: { type: 'string' },
        businessKey: { type: 'string' },
        revision: { type: 'integer' },
        data: {
            type: 'object',
            properties: Object.fromEntries(Object.keys(traitsOf(entityType)).map(key => [key, key === 'body' ? bodyType(entityType) : {}])),
            additionalProperties: false
        }
    },
    additionalProperties: false
});

const mappingProblems = (code, scope, expected, label) => mappingType(code, scope, expected).problems
    .filter(problem => CHECKED.includes(problem.code))
    .map(problem => `${label} ${problem.message}`);

const dereferenced = schema => typeof schema === 'string' && schema.startsWith('@') ? dereferenced(getElement(schema.slice(1)).data) : schema;

const inputSchemaOf = schema => {
    const declared = dereferenced(schema);
    return declared?.['$data#&'] === undefined
        ? dereferenced(declared?.['!input'])
        : declared['$data#&'].map(inputSchemaOf).find(found => found !== undefined);
};

const operationInputType = (entityType, { key, operation }) => {
    const declared = inputSchemaOf(resolveKind(getElement(traitsOf(entityType)[key].trait).kind).operations[operation].input);
    if (declared === undefined) return {};
    const type = standardOf(declared);
    return key === 'body' && type.properties?.body !== undefined ? { ...type, properties: { ...type.properties, body: bodyType(entityType) } } : type;
};

const useProblems = ({ entityType, type, effect }, scope, use) => {
    const trait = traitsOf(entityType)[use.key];
    const where = `${entityType}: the ${effect} of ${type} runs '${use.operation}' of '${use.key}'`;
    if (trait === undefined) return [`${where}, but ${entityType} has no trait '${use.key}'`];
    if (!(use.operation in resolveKind(getElement(trait.trait).kind).operations)) return [`${where}, but trait '${trait.trait}' has no such operation`];
    return mappingProblems(use.input, scope, operationInputType(entityType, use), `${where}, its input`);
};

const scopeOf = (entityType, type) => ({
    type: 'object',
    properties: { entity: recordType(entityType), amendment: recordType(type), effectiveFrom: { type: 'string' } },
    additionalProperties: false
});

const listProblems = (context, uses) => {
    const scope = scopeOf(context.entityType, context.type);
    return [
        ...Object.entries(Object.groupBy(uses, ({ key }) => key)).filter(([, group]) => group.length > 1).map(([key]) => `${context.entityType}: the ${context.effect} of ${context.type} runs a trait operation of '${key}' twice`),
        ...uses.flatMap(use => useProblems(context, scope, use))
    ];
};

const pairedProblems = (entityType, type, { apply, revert }) => (Array.isArray(apply) ? apply : [])
    .map(({ key }) => key)
    .filter(key => !(Array.isArray(revert) ? revert.map(use => use.key) : DEFAULT_REVERT_KEYS).includes(key))
    .map(key => `${entityType}: the apply of ${type} changes '${key}' and its revert doesn't`);

const kindProblems = (entityType, type, kind) => {
    if (!isInstanceOf({ element: type, kind: 'entity-type' })) return [`${entityType} names '${type}' as an amendment type, which is no entity type`];
    return [
        ...kind.mapping === undefined ? [] : mappingProblems(kind.mapping, { type: 'object', properties: { entity: recordType(entityType), input: {} }, additionalProperties: false }, bodyType(type), `${entityType}: the mapping of ${type}`),
        ...kind.applicable === undefined ? [] : mappingProblems(kind.applicable, scopeOf(entityType, type), { type: 'boolean' }, `${entityType}: the applicable of ${type}`),
        ...['apply', 'revert'].filter(effect => Array.isArray(kind[effect])).flatMap(effect => listProblems({ entityType, type, effect }, kind[effect])),
        ...pairedProblems(entityType, type, kind)
    ];
};

export const amendableProblems = trait => selvesOf('trait-container').flatMap(({ id }) => Object.values(traitsOf(id))
    .filter(use => use.trait === trait)
    .flatMap(use => Object.entries(use.configuration).flatMap(([type, kind]) => kindProblems(id, type, kind))));
