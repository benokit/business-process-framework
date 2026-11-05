import { getElement } from '@business-framework/core';
import { resolveKind, selvesOf } from '@business-framework/core/kinds';
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

const CHECKED = ['unknown-path', 'type-mismatch', 'missing-property', 'unknown-property'];

const mappingProblems = (code, scope, expected, label) => mappingType(code, scope, expected).problems
    .filter(problem => CHECKED.includes(problem.code))
    .map(problem => `${label} ${problem.message}`);

const linkType = () => standardOf(getElement('amendment-link-value').data);

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

const useProblems = (entityType, type, direction, use) => {
    const trait = traitsOf(entityType)[use.key];
    const where = `${entityType}: the ${direction} of ${type} runs '${use.operation}' of '${use.key}'`;
    if (trait === undefined) return [`${where}, but ${entityType} has no trait '${use.key}'`];
    if (!(use.operation in resolveKind(getElement(trait.trait).kind).operations)) return [`${where}, but trait '${trait.trait}' has no such operation`];
    return mappingProblems(
        use.input,
        { type: 'object', properties: { body: bodyType(entityType), amendment: recordType(type), link: linkType() }, additionalProperties: false },
        operationInputType(entityType, use),
        `${where}, its input`
    );
};

const listProblems = (entityType, type, direction, uses) => [
    ...Object.entries(Object.groupBy(uses, ({ key }) => key)).filter(([, group]) => group.length > 1).map(([key]) => `${entityType}: the ${direction} of ${type} runs a trait operation of '${key}' twice`),
    ...uses.flatMap(use => useProblems(entityType, type, direction, use))
];

const DEFAULT_USES = [{ key: 'body' }];

const unpairedProblems = (entityType, type, { apply = DEFAULT_USES, revert = DEFAULT_USES }) => apply
    .filter(({ key }) => !revert.some(use => use.key === key))
    .map(({ key }) => `${entityType}: the apply of ${type} changes '${key}' and its revert doesn't`);

const fillProblems = (entityType, fill) => {
    const { type, open, apply, revert, input } = fill;
    return [
        ...open === undefined ? [] : mappingProblems(open, { type: 'object', properties: { entity: recordType(entityType), input: inputType(input) }, additionalProperties: false }, bodyType(type), `${entityType}: the open mapping of ${type}`),
        ...apply === undefined ? [] : listProblems(entityType, type, 'apply', apply),
        ...revert === undefined ? [] : listProblems(entityType, type, 'revert', revert),
        ...unpairedProblems(entityType, type, fill)
    ];
};

export const amendmentFillProblems = () => selvesOf('versioned-entity-type')
    .flatMap(({ id }) => slotValues({ element: id, slot: 'amendmentTypes' })
        .filter(fill => typeof fill === 'object')
        .flatMap(fill => fillProblems(id, fill)));
