import { getElement } from '@business-framework/core';
import { isInstanceOf, resolveKind, selfOf, unite } from '@business-framework/core/kinds';
import { fillsOf } from '@business-framework/core/slots';
import { validateValue } from '@business-framework/core/schemas';

const cardinalityOf = trait => getElement(trait).data.cardinality ?? 'one';

const isTrait = trait => isInstanceOf({ element: trait, kind: 'entity-trait' });

const isName = key => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(key);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const dataContributions = entityType => Object.entries(selfOf(getElement(entityType)).data.traits ?? {})
    .map(([key, { trait, configuration }]) => ({ key, trait, configuration, source: entityType }));

const fillContributions = entityType => fillsOf(selfOf(getElement(entityType)), 'traits').fills
    .map(({ id, data: { target, value: { trait, key, configuration } } }) => ({ key: key ?? trait, trait, configuration, target, source: id ?? target }));

const unitedWith = ({ configuration, conflicts }, contribution, key) => {
    try {
        return { configuration: unite(configuration, contribution.configuration ?? {}, contribution.source), conflicts };
    } catch (error) {
        if (error.code !== 'fixed-conflict') throw error;
        return { configuration, conflicts: [...conflicts, `trait '${key}': ${error.data.owner} can't change the value at 'configuration.${error.data.path.join('.')}'`] };
    }
};

const unionOf = (key, contributions) => contributions.reduce((united, contribution) => unitedWith(united, contribution, key), { configuration: {}, conflicts: [] });

const resolve = entityType => Object.entries(Object.groupBy([...dataContributions(entityType), ...fillContributions(entityType)].filter(({ key }) => key !== undefined), ({ key }) => key))
    .map(([key, contributions]) => {
        const traits = [...new Set(contributions.map(({ trait }) => trait ?? (isTrait(key) ? key : undefined)).filter(trait => trait !== undefined))].sort();
        return { key, trait: traits[0] ?? key, traits, ...unionOf(key, contributions) };
    });

export const traitsOf = entityType => Object.fromEntries(resolve(entityType).map(({ key, trait, configuration }) => [key, { trait, configuration }]));

const configurationProblems = (trait, configuration) => validateValue({ schemaId: `${trait}/configuration`, value: configuration }).errors
    .map(error => `trait '${trait}': configuration${error.instancePath} ${error.message}`);

const cardinalityProblems = ({ key, trait }) => cardinalityOf(trait) === 'many'
    ? (key === trait ? [`trait '${trait}' needs a key`] : [])
    : (key === trait ? [] : [`trait '${trait}' has cardinality one and takes no key`]);

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
            ...cardinalityProblems(use),
            ...configurationProblems(use.trait, use.configuration),
            ...optionalAndRequired(use.configuration).map(path => `trait '${use.key}': configuration.${path} is both optional and required`)
        ]
        : [`'${use.trait}' is not an entity trait`])
];

const isRepeated = (fill, index, fills) => fills.findIndex(other => other.target === fill.target && other.key === fill.key) !== index;

const closedProblems = entityType => {
    const kind = selfOf(getElement(entityType)).kind;
    const declared = Object.keys(resolveKind(kind).fixed.traits ?? {});
    const injectors = Object.groupBy(fillContributions(entityType), ({ key }) => key);
    return Object.keys(getElement(entityType).data.traits ?? {})
        .filter(key => !declared.includes(key) && key in injectors)
        .map(key => `traits.${key} is injected by ${injectors[key].map(({ source }) => source).join(', ')} and not declared by ${kind}`);
};

export const traitProblems = entityType => {
    const fills = fillContributions(entityType);
    return [
        ...fills.filter(({ key }) => key === undefined).map(({ source }) => `${source} names neither a trait nor a key`),
        ...fills.filter(isRepeated).map(({ key, target }) => `trait '${key}' is used twice on ${target}`),
        ...closedProblems(entityType),
        ...resolve(entityType).flatMap(useProblems)
    ];
};
