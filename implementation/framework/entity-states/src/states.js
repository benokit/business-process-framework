import { isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { traitsOf } from '@business-framework/entities/traits';

export const applyTransition = ({ model, state, transition }) => {
    const targets = Object.entries(model.transitions?.[transition] ?? {}).map(([dimension, edges]) => [dimension, edges[state[dimension]]]);
    return targets.length > 0 && targets.every(([, target]) => target !== undefined) ? { ...state, ...Object.fromEntries(targets) } : null;
};

export const initialState = ({ model, name }) => model.initialStates?.[name ?? 'default'] ?? null;

const undeclared = (model, dimension, state, where) => model.states[dimension]?.[state] === true
    ? []
    : [`${where} uses undeclared state ${dimension}=${state}`];

const checkStatesModel = model => [
    ...Object.entries(model.transitions ?? {}).flatMap(([name, dimensions]) => Object.entries(dimensions)
        .flatMap(([dimension, edges]) => Object.entries(edges)
            .flatMap(([source, target]) => [
                ...undeclared(model, dimension, source, `transition '${name}'`),
                ...undeclared(model, dimension, target, `transition '${name}'`)
            ]))),
    ...Object.entries(model.initialStates ?? {}).flatMap(([name, state]) => Object.entries(state)
        .flatMap(([dimension, value]) => undeclared(model, dimension, value, `initial state '${name}'`)))
];

export const statesModelProblems = trait => selvesOf('entity-type').flatMap(({ id }) => {
    const model = traitsOf(id)[trait];
    return model ? checkStatesModel(model).map(problem => `${id}: ${problem}`) : [];
});

export const transitionNames = () => [...new Set(selvesOf('entity-type').flatMap(({ id }) => Object.entries(traitsOf(id))
    .filter(([trait]) => isInstanceOf({ element: trait, kind: 'states-trait' }))
    .flatMap(([, model]) => Object.keys(model.transitions ?? {}))))].sort();
