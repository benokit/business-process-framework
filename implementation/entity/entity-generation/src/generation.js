import { getElement } from '@business-framework/core';
import { resolveKind, selvesOf } from '@business-framework/core/kinds';
import { standardOf } from '@business-framework/core/schemas';
import { mappingType } from '@business-framework/core/data-flow';
import { applyMapping } from '@business-framework/core/mappings';
import { traitsOf } from '@business-framework/entities/traits';
import { stateOf } from '@business-framework/entity-states/states';

const movedAlong = (binding, before, after) => Object.entries(binding).every(([dimension, edges]) => Object.entries(edges)
    .some(([from, to]) => stateOf(before)?.[dimension] === from && stateOf(after)?.[dimension] === (to === true ? from : to)));

export const firedEffects = ({ configuration, before, after }) => before === undefined || before === null
    ? []
    : Object.entries(configuration).filter(([, binding]) => movedAlong(binding, before, after)).map(([effect]) => effect);

const GENERATOR_KEY = 'generator';

const declaredOperations = ({ declaration, effect, scope }) => (declaration.effects?.[effect] ?? [])
    .map(({ key, operation, input }) => ({ key, operation, input: applyMapping({ mapping: input, input: scope }) }));

export const generationOperations = ({ configuration, declaration, effect, scope }) => applyMapping({
    mapping: configuration.effects ?? '#.declared',
    input: { ...scope, declaration, effect, declared: declaredOperations({ declaration, effect, scope }) }
});

export const linkedGenerationOperations = ({ source, generated, effect }) => {
    const link = generated.data.generated;
    const { configuration } = traitsOf(link.sourceType)[GENERATOR_KEY];
    return generationOperations({ configuration, declaration: configuration.declarations[link.generator], effect, scope: { source, generated, link } });
};

export const generationKey = ({ configuration, source, request }) => applyMapping({ mapping: configuration.key ?? '#.request.key', input: { source, request } });

const bodyType = entityType => {
    const schema = traitsOf(entityType).body?.configuration.schema;
    return schema === undefined ? {} : standardOf(schema);
};

const linkType = () => standardOf(getElement('generation-link-value').data);

const traitType = (entityType, key) => {
    if (key === 'body') return bodyType(entityType);
    return key === 'generated' ? linkType() : {};
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

const CHECKED = ['unknown-path', 'type-mismatch', 'missing-property', 'unknown-property'];

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

const bodyRefined = (entityType, key, type) => key === 'body' && type.properties?.body !== undefined
    ? { ...type, properties: { ...type.properties, body: bodyType(entityType) } }
    : type;

const operationInputType = (entityType, { key, operation }) => {
    const declared = inputSchemaOf(resolveKind(getElement(traitsOf(entityType)[key].trait).kind).operations[operation].input);
    return declared === undefined ? {} : bodyRefined(entityType, key, standardOf(declared));
};

const useProblems = (entityType, { name, type }, effect, use) => {
    const trait = traitsOf(entityType)[use.key];
    const where = `${entityType}: the ${effect} of ${name} runs '${use.operation}' of '${use.key}'`;
    if (trait === undefined) return [`${where}, but ${entityType} has no trait '${use.key}'`];
    if (!(use.operation in resolveKind(getElement(trait.trait).kind).operations)) return [`${where}, but trait '${trait.trait}' has no such operation`];
    return mappingProblems(
        use.input,
        { type: 'object', properties: { source: recordType(entityType), generated: recordType(type), link: linkType() }, additionalProperties: false },
        operationInputType(entityType, use),
        `${where}, its input`
    );
};

const listProblems = (entityType, declared, effect, uses) => [
    ...Object.entries(Object.groupBy(uses, ({ key }) => key)).filter(([, group]) => group.length > 1).map(([key]) => `${entityType}: the ${effect} of ${declared.name} runs a trait operation of '${key}' twice`),
    ...uses.flatMap(use => useProblems(entityType, declared, effect, use))
];

const pairedProblems = (entityType, type, effects, { changes, undoneBy, defaultKeys }) => (effects[changes] ?? [])
    .map(({ key }) => key)
    .filter(key => !(effects[undoneBy] ?? defaultKeys.map(defaultKey => ({ key: defaultKey }))).some(use => use.key === key))
    .map(key => `${entityType}: the ${changes} of ${type} changes '${key}' and its ${undoneBy} doesn't`);

const declarationProblems = (entityType, name, declaration, pairs) => {
    const { type, open, input, effects = {} } = declaration;
    return [
        ...open === undefined ? [] : mappingProblems(open, { type: 'object', properties: { entity: recordType(entityType), input: inputType(input) }, additionalProperties: false }, { type: 'object', properties: { body: bodyType(type) } }, `${entityType}: the open mapping of ${name}`),
        ...Object.entries(effects).flatMap(([effect, uses]) => listProblems(entityType, { name, type }, effect, uses)),
        ...pairs.flatMap(pair => pairedProblems(entityType, name, effects, pair))
    ];
};

export const generatorProblems = trait => {
    const pairs = getElement(trait).data.pairs ?? [];
    return selvesOf('trait-container').flatMap(({ id }) => Object.values(traitsOf(id))
        .filter(use => use.trait === trait)
        .flatMap(use => Object.entries(use.configuration.declarations ?? {}).flatMap(([name, declaration]) => declarationProblems(id, name, declaration, pairs))));
};
