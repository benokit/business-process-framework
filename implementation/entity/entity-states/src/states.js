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

const DEFAULT_PERMISSION_DIMENSION = 'status';

const permissionDimensionOf = model => model.permissionDimension
    ?? (Object.keys(model.states).length === 1 ? Object.keys(model.states)[0] : DEFAULT_PERMISSION_DIMENSION);

const permissionStatesOf = model => Object.keys(model.states[permissionDimensionOf(model)] ?? {});

const permissionDimensionProblems = model => model.states[permissionDimensionOf(model)] === undefined
    ? [`the permission dimension ${permissionDimensionOf(model)} is no state dimension`]
    : [];

const checkStatesModel = model => [
    ...permissionDimensionProblems(model),
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
    const uses = Object.values(traitsOf(id)).filter(use => use.trait === trait);
    return uses.flatMap(({ configuration }) => checkStatesModel(configuration).map(problem => `${id}: ${problem}`));
});

const statesConfigurationOf = entityType => Object.values(traitsOf(entityType))
    .filter(({ trait }) => isInstanceOf({ element: trait, kind: 'states-trait' }))
    .map(({ configuration }) => configuration);

const statesConfigurations = () => selvesOf('entity-type').flatMap(({ id }) => statesConfigurationOf(id));

export const transitionNames = () => [...new Set(statesConfigurations()
    .flatMap(configuration => Object.keys(configuration.transitions ?? {})))].sort();

export const permissionStateNames = () => [...new Set(statesConfigurations()
    .flatMap(permissionStatesOf))].sort();

export const permissionState = ({ entityType, state }) => {
    const [model] = statesConfigurationOf(entityType);
    return model === undefined ? null : state[permissionDimensionOf(model)] ?? null;
};

export const permissionStatesOfType = entityType => statesConfigurationOf(entityType).flatMap(permissionStatesOf);

export const transitionsOfType = entityType => statesConfigurationOf(entityType).flatMap(model => Object.keys(model.transitions ?? {}));
