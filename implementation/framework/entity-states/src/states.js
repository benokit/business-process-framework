import { isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { traitsOf } from '@business-framework/entities/traits';

const matches = (from, state) => Object.entries(from).every(([dimension, allowed]) => allowed.includes(state[dimension]));

export const applyTransition = ({ model, state, transition }) => {
    const definition = model.transitions?.[transition];
    return definition && matches(definition.from, state) ? { ...state, ...definition.to } : null;
};

export const initialState = ({ model, name }) => model.initialStates?.[name ?? 'default'] ?? null;

const undeclared = (states, dimensions, where) => Object.entries(dimensions)
    .flatMap(([dimension, values]) => [values].flat()
        .filter(value => !(states[dimension] ?? []).includes(value))
        .map(value => `${where} uses undeclared state ${dimension}=${value}`));

const checkStatesModel = model => [
    ...Object.entries(model.transitions ?? {}).flatMap(([name, { from, to }]) => [
        ...undeclared(model.states, from, `transition '${name}'`),
        ...undeclared(model.states, to, `transition '${name}'`)
    ]),
    ...Object.entries(model.initialStates ?? {}).flatMap(([name, dimensions]) => undeclared(model.states, dimensions, `initial state '${name}'`))
];

export const statesModelProblems = trait => selvesOf('entity-type').flatMap(({ id }) => {
    const model = traitsOf(id)[trait];
    return model ? checkStatesModel(model).map(problem => `${id}: ${problem}`) : [];
});

export const transitionNames = () => [...new Set(selvesOf('entity-type').flatMap(({ id }) => Object.entries(traitsOf(id))
    .filter(([trait]) => isInstanceOf({ element: trait, kind: 'states-trait' }))
    .flatMap(([, model]) => Object.keys(model.transitions ?? {}))))].sort();
