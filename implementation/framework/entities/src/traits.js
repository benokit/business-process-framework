import { getElement } from '@business-framework/core';
import { isInstanceOf, selfOf } from '@business-framework/core/kinds';
import { fillsOf, slotValues } from '@business-framework/core/slots';
import { validateValue } from '@business-framework/core/schemas';

export const traitsOf = entityType => Object.fromEntries(slotValues({ element: entityType, slot: 'traits' })
    .map(({ trait, configuration }) => [trait, configuration]));

const configurationProblems = (trait, configuration) => validateValue({ schemaId: `${trait}/configuration`, value: configuration }).errors
    .map(error => `trait '${trait}': configuration${error.instancePath} ${error.message}`);

const useProblems = ([trait, configuration]) => isInstanceOf({ element: trait, kind: 'entity-trait' })
    ? configurationProblems(trait, configuration)
    : [`'${trait}' is not an entity trait`];

const isRepeated = (fill, index, fills) => fills.findIndex(other =>
    other.data.target === fill.data.target && other.data.value.trait === fill.data.value.trait) !== index;

export const traitProblems = entityType => [
    ...fillsOf(selfOf(getElement(entityType)), 'traits').fills
        .filter(isRepeated)
        .map(fill => `trait '${fill.data.value.trait}' is used twice on ${fill.data.target}`),
    ...Object.entries(traitsOf(entityType)).flatMap(useProblems)
];
