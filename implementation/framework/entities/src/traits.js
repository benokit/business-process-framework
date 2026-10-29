import { getElement } from '@business-framework/core';
import { isInstanceOf, selfOf } from '@business-framework/core/kinds';
import { fillsOf, slotValues } from '@business-framework/core/slots';
import { validateValue } from '@business-framework/core/schemas';

const keyOf = ({ trait, key }) => key ?? trait;

const cardinalityOf = trait => getElement(trait).data.cardinality ?? 'one';

export const traitsOf = entityType => Object.fromEntries(slotValues({ element: entityType, slot: 'traits' })
    .map(use => [keyOf(use), { trait: use.trait, configuration: use.configuration }]));

const configurationProblems = (trait, configuration) => validateValue({ schemaId: `${trait}/configuration`, value: configuration }).errors
    .map(error => `trait '${trait}': configuration${error.instancePath} ${error.message}`);

const isName = key => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(key);

const keyProblems = ({ trait, key }) => {
    if (key === 'body') return ["key 'body' is reserved"];
    if (key !== undefined && !isName(key)) return [`key '${key}' is not lowercase letters and digits in segments joined by '-'`];
    if (cardinalityOf(trait) === 'many') return key === undefined ? [`trait '${trait}' needs a key`] : [];
    return key === undefined ? [] : [`trait '${trait}' has cardinality one and takes no key`];
};

const useProblems = ([, { trait, configuration }]) => isInstanceOf({ element: trait, kind: 'entity-trait' })
    ? configurationProblems(trait, configuration)
    : [`'${trait}' is not an entity trait`];

const isRepeated = (fill, index, fills) => fills.findIndex(other =>
    other.data.target === fill.data.target && keyOf(other.data.value) === keyOf(fill.data.value)) !== index;

const isTrait = trait => isInstanceOf({ element: trait, kind: 'entity-trait' });

export const traitProblems = entityType => {
    const fills = fillsOf(selfOf(getElement(entityType)), 'traits').fills;
    return [
        ...fills.filter(isRepeated).map(fill => `trait '${keyOf(fill.data.value)}' is used twice on ${fill.data.target}`),
        ...fills.map(fill => fill.data.value).filter(({ trait }) => isTrait(trait)).flatMap(keyProblems),
        ...Object.entries(traitsOf(entityType)).flatMap(useProblems)
    ];
};
