import { getElement } from '@business-framework/core';
import { hasOperation, isInstanceOf, resolveKind, selfAt, selfOf, unite } from '@business-framework/core/kinds';
import { fillsOf } from '@business-framework/core/slots';
import { methodChangesOf } from '@business-framework/core/effects';
import { memo } from '@business-framework/core/registry';
import { validateValue } from '@business-framework/core/schemas';

const keyOf = trait => getElement(trait).data.key ?? trait;

const isTrait = trait => isInstanceOf({ element: trait, kind: 'entity-trait' });

const isName = key => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(key);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const dataContributions = entityType => Object.entries(selfAt(getElement(entityType), 'trait-container').data.traits ?? {})
    .map(([key, { trait, configuration }]) => ({ key, trait, configuration, source: entityType }));

const fillContributions = entityType => fillsOf(selfOf(getElement(entityType)), 'traits').fills
    .map(({ id, data: { target, value: { trait, key, configuration } } }) => ({ key: key ?? (trait !== undefined && isTrait(trait) ? keyOf(trait) : trait), trait, configuration, target, source: id ?? target }));

const unitedWith = ({ configuration, conflicts }, contribution, key) => {
    try {
        return { configuration: unite(configuration, contribution.configuration ?? {}, contribution.source), conflicts };
    } catch (error) {
        if (error.code !== 'fixed-conflict') throw error;
        return { configuration, conflicts: [...conflicts, `trait '${key}': ${error.data.owner} can't change the value at 'configuration.${error.data.path.join('.')}'`] };
    }
};

const unionOf = (key, contributions) => contributions.reduce((united, contribution) => unitedWith(united, contribution, key), { configuration: {}, conflicts: [] });

const isAlternativeTo = key => trait => trait !== key && isTrait(trait) && keyOf(trait) === key;

const traitsOfKey = (key, contributions) => {
    const named = [...new Set(contributions.map(({ trait }) => trait ?? (isTrait(key) ? key : undefined)).filter(trait => trait !== undefined))].sort();
    return named.some(isAlternativeTo(key)) ? named.filter(trait => trait !== key) : named;
};

const resolve = entityType => Object.entries(Object.groupBy([...dataContributions(entityType), ...fillContributions(entityType)].filter(({ key }) => key !== undefined), ({ key }) => key))
    .map(([key, contributions]) => {
        const traits = traitsOfKey(key, contributions);
        return { key, trait: traits[0] ?? key, traits, ...unionOf(key, contributions) };
    });

export const traitsOf = entityType => Object.fromEntries(resolve(entityType).map(({ key, trait, configuration }) => [key, { trait, configuration }]));

export const traitUseOf = ({ entityType, key }) => {
    const use = traitsOf(entityType)[key];
    return use ? { ...use, key } : null;
};

const keyOfKind = memo(signature => {
    const [entityType, kind] = JSON.parse(signature);
    return Object.entries(traitsOf(entityType)).find(([, { trait }]) => isTrait(trait) && isInstanceOf({ element: trait, kind }))?.[0] ?? null;
});

export const traitKeyOf = ({ entityType, kind }) => keyOfKind(JSON.stringify([entityType, kind]));

export const traitValueOf = ({ record, kind }) => {
    const key = record ? traitKeyOf({ entityType: record.entityType, kind }) : null;
    return key === null ? null : record.data[key] ?? null;
};

const isIdentity = ({ trait }) => isTrait(trait) && getElement(trait).data.identity === true;

export const identityKeyOf = entityType => Object.entries(traitsOf(entityType)).find(([, use]) => isIdentity(use))?.[0] ?? null;

export const valuedKeysOf = entityType => Object.entries(traitsOf(entityType))
    .filter(([, { trait }]) => hasOperation({ element: trait, operation: 'initialize' }))
    .map(([key]) => key);

const configurationProblems = (trait, configuration) => validateValue({ schemaId: `${trait}/configuration`, value: configuration }).errors
    .map(error => `trait '${trait}': configuration${error.instancePath} ${error.message}`);

const keyProblems = ({ key, trait }) => key === keyOf(trait) ? [] : [`trait '${trait}' is used under the key '${key}', and its key is '${keyOf(trait)}'`];

const optionalAndRequired = (value, path = []) => isObject(value)
    ? [
        ...Object.entries(Object.groupBy(Object.keys(value), field => field.replace(/^!/, '')))
            .filter(([, fields]) => fields.length > 1 && fields.some(field => field.startsWith('!')))
            .map(([name]) => [...path, name].join('.')),
        ...Object.entries(value).flatMap(([field, inner]) => optionalAndRequired(inner, [...path, field]))
    ]
    : [];

const useProblems = use => [
    ...(use.traits.length > 1 ? [`key '${use.key}' is used by the traits ${use.traits.join(' and ')}`] : []),
    ...(isName(use.key) ? [] : [`key '${use.key}' is not lowercase letters and digits in segments joined by '-'`]),
    ...use.conflicts,
    ...(isTrait(use.trait)
        ? [
            ...keyProblems(use),
            ...configurationProblems(use.trait, use.configuration),
            ...optionalAndRequired(use.configuration).map(path => `trait '${use.key}': configuration.${path} is both optional and required`)
        ]
        : [`'${use.trait}' is not an entity trait`])
];

const isRepeated = (fill, index, fills) => fill.trait !== undefined && fills.findIndex(other => other.trait !== undefined && other.target === fill.target && other.key === fill.key) !== index;

const closedProblems = entityType => {
    const kind = selfOf(getElement(entityType)).kind;
    const declared = Object.keys(resolveKind(kind).fixed.traits ?? {});
    const injectors = Object.groupBy(fillContributions(entityType), ({ key }) => key);
    return Object.keys(getElement(entityType).data.traits ?? {})
        .filter(key => !declared.includes(key) && key in injectors)
        .map(key => `traits.${key} is injected by ${injectors[key].map(({ source }) => source).join(', ')} and not declared by ${kind}`);
};

const guardHookProblems = entityType => Object.values(traitsOf(entityType))
    .filter(({ trait }) => isTrait(trait) && getElement(trait).data.guard !== undefined)
    .flatMap(({ trait }) => methodChangesOf({ element: trait, property: 'guard' }).map(change => `trait '${trait}': its guard may only read and trace, but has ${change}`));

const publicOperationsOfTrait = trait => Object.entries(resolveKind(getElement(trait).kind).operations)
    .filter(([, operation]) => operation.public === true);

export const publicOperationsOf = entityType => [...new Set(Object.values(traitsOf(entityType))
    .filter(({ trait }) => isTrait(trait))
    .flatMap(({ trait }) => publicOperationsOfTrait(trait).map(([name]) => name)))].sort();

export const publicOperationOf = ({ entityType, key, operation }) => {
    const use = traitsOf(entityType)[key];
    const declared = use === undefined || !isTrait(use.trait) ? undefined : Object.fromEntries(publicOperationsOfTrait(use.trait))[operation];
    return declared === undefined ? null : { form: declared.output === '@trait-plan' ? 'plan' : 'command' };
};

const publicOperationProblems = entityType => Object.entries(Object.groupBy(
    Object.values(traitsOf(entityType)).filter(({ trait }) => isTrait(trait)).flatMap(({ trait }) => publicOperationsOfTrait(trait).map(([name]) => ({ name, trait }))),
    ({ name }) => name
))
    .filter(([, offers]) => new Set(offers.map(({ trait }) => trait)).size > 1)
    .map(([name, offers]) => `${entityType}: the traits ${[...new Set(offers.map(({ trait }) => trait))].join(' and ')} both offer the operation '${name}'`);

const identityProblems = entityType => {
    const count = Object.values(traitsOf(entityType)).filter(isIdentity).length;
    return count === 1 ? [] : [`${entityType} has ${count} traits that give the business key, needs one`];
};

export const traitProblems = entityType => {
    const fills = fillContributions(entityType);
    return [
        ...identityProblems(entityType),
        ...guardHookProblems(entityType),
        ...publicOperationProblems(entityType),
        ...fills.filter(({ key }) => key === undefined).map(({ source }) => `${source} names neither a trait nor a key`),
        ...fills.filter(isRepeated).map(({ key, target }) => `trait '${key}' is used twice on ${target}`),
        ...closedProblems(entityType),
        ...resolve(entityType).flatMap(useProblems)
    ];
};

export const dataWithCommands = ({ data, commands }) => ({ ...data, ...Object.fromEntries(commands.map(({ key, value }) => [key, value])) });
