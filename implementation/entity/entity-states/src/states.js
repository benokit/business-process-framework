import { getElement } from '@business-framework/core';
import { hasOperation, isInstanceOf, resolveKind, selfOf, selvesOf } from '@business-framework/core/kinds';
import { hookedKeysOf, traitEntriesOf, traitsOf, traitValueOf } from '@business-framework/entities/traits';

export const applyTransition = ({ model, state, transition }) => {
    const targets = Object.entries(model.transitions?.[transition] ?? {}).map(([dimension, edges]) => [dimension, edges[state[dimension]] === true ? state[dimension] : edges[state[dimension]]]);
    return targets.length > 0 && targets.every(([, target]) => target !== undefined) ? { ...state, ...Object.fromEntries(targets) } : null;
};

export const initialState = ({ model, name }) => model.initialStates?.[name ?? 'default'] ?? null;

const isDeclaration = declaration => declaration === true || (declaration !== null && typeof declaration === 'object');

const undeclared = (model, dimension, state, where) => isDeclaration(model.states[dimension]?.[state])
    ? []
    : [`${where} uses undeclared state ${dimension}=${state}`];

const declarationsOf = (model, dimension) => Object.entries(model.states[dimension] ?? {});

const hasMoves = declaration => Array.isArray(declaration?.to);

const hasInitial = declaration => declaration?.initial === true;

const restrictsMoves = (model, dimension) => declarationsOf(model, dimension).some(([, declaration]) => hasMoves(declaration));

const restrictsInitial = (model, dimension) => declarationsOf(model, dimension).some(([, declaration]) => hasInitial(declaration));

const movesProblems = (model, dimension) => !restrictsMoves(model, dimension)
    ? []
    : declarationsOf(model, dimension).flatMap(([state, declaration]) => hasMoves(declaration)
        ? declaration.to.filter(target => !isDeclaration(model.states[dimension][target])).map(target => `state ${dimension}=${state} leads to undeclared state ${target}`)
        : [`state ${dimension}=${state} declares no moves in a dimension that restricts them (to: [] ends it)`]);

const moveProblems = (model, name, dimension, source, target) => source === target || !hasMoves(model.states[dimension]?.[source]) || model.states[dimension][source].to.includes(target)
    ? []
    : [`transition '${name}' moves ${dimension} from ${source} to ${target}, which the dimension does not allow`];

const initialProblems = (model, name, dimension, value) => !restrictsInitial(model, dimension) || hasInitial(model.states[dimension]?.[value])
    ? []
    : [`initial state '${name}' starts ${dimension} in ${value}, which the dimension does not allow`];

const DEFAULT_PROCESS_DIMENSION = 'status';

const processDimensionOf = model => model.processDimension
    ?? (Object.keys(model.states).length === 1 ? Object.keys(model.states)[0] : DEFAULT_PROCESS_DIMENSION);

const processStatesOf = model => Object.keys(model.states[processDimensionOf(model)] ?? {});

const processDimensionProblems = model => model.states[processDimensionOf(model)] === undefined
    ? [`the process dimension ${processDimensionOf(model)} is no state dimension`]
    : [];

const NOT_GOVERNED = ['read', 'create', 'transition'];

const exposedOperationsOf = entityType => Object.entries(resolveKind(selfOf(getElement(entityType)).kind).operations)
    .filter(([name, operation]) => !operation.private && !NOT_GOVERNED.includes(name))
    .map(([name]) => name);

const isMessageOf = (entityType, name) => {
    const [key, entry] = name.split('/');
    return entry !== undefined && (hookedKeysOf({ entityType, operation: 'receive' }).includes(key) || traitEntriesOf({ entityType, key }).includes(entry));
};

const operationsProblems = (model, entityType) => Object.entries(model.operations ?? {}).flatMap(([name, dimensions]) => [
    ...exposedOperationsOf(entityType).includes(name) || isMessageOf(entityType, name) ? [] : [`operation '${name}' is no operation the entity type exposes nor a message or an entry of one of its traits (<trait key>/<message>), other than ${NOT_GOVERNED.join(', ')}`],
    ...Object.entries(dimensions).flatMap(([dimension, states]) => Object.keys(states)
        .flatMap(state => undeclared(model, dimension, state, `operation '${name}'`)))
]);

const checkStatesModel = (model, entityType) => [
    ...operationsProblems(model, entityType),
    ...processDimensionProblems(model),
    ...Object.keys(model.states).flatMap(dimension => movesProblems(model, dimension)),
    ...Object.entries(model.transitions ?? {}).flatMap(([name, dimensions]) => Object.entries(dimensions)
        .flatMap(([dimension, edges]) => Object.entries(edges)
            .flatMap(([source, target]) => [
                ...undeclared(model, dimension, source, `transition '${name}'`),
                ...target === true ? [] : [
                    ...undeclared(model, dimension, target, `transition '${name}'`),
                    ...moveProblems(model, name, dimension, source, target)
                ]
            ]))),
    ...Object.entries(model.initialStates ?? {}).flatMap(([name, state]) => Object.entries(state)
        .flatMap(([dimension, value]) => [
            ...undeclared(model, dimension, value, `initial state '${name}'`),
            ...initialProblems(model, name, dimension, value)
        ]))
];

export const statesModelProblems = trait => selvesOf('entity-type').flatMap(({ id }) => {
    const uses = Object.values(traitsOf(id)).filter(use => use.trait === trait);
    const unexposed = uses.length > 0 && !hasOperation({ element: id, operation: 'transition' }) ? [`${id}: has states and exposes no transition operation`] : [];
    return [...unexposed, ...uses.flatMap(({ configuration }) => checkStatesModel(configuration, id).map(problem => `${id}: ${problem}`))];
});

const statesConfigurationOf = entityType => Object.values(traitsOf(entityType))
    .filter(({ trait }) => isInstanceOf({ element: trait, kind: 'states-trait' }))
    .map(({ configuration }) => configuration);

const statesConfigurations = () => selvesOf('entity-type').flatMap(({ id }) => statesConfigurationOf(id));

export const transitionNames = () => [...new Set(statesConfigurations()
    .flatMap(configuration => Object.keys(configuration.transitions ?? {})))].sort();

export const processStateNames = () => [...new Set(statesConfigurations()
    .flatMap(processStatesOf))].sort();

export const processState = ({ entityType, state }) => {
    const [model] = statesConfigurationOf(entityType);
    return model === undefined ? null : state[processDimensionOf(model)] ?? null;
};

export const processStatesOfType = entityType => statesConfigurationOf(entityType).flatMap(processStatesOf);

export const transitionsOfType = entityType => statesConfigurationOf(entityType).flatMap(model => Object.keys(model.transitions ?? {}));

const allows = (model, name, state) => Object.entries(model.operations?.[name] ?? {}).every(([dimension, states]) => states[state[dimension]] === true);

export const forbidsOperation = ({ entityType, entityOperation, state }) => {
    const [model] = statesConfigurationOf(entityType);
    return entityOperation !== undefined && model !== undefined && state !== undefined && !allows(model, entityOperation, state);
};

export const stateOf = record => traitValueOf({ record, kind: 'states-trait' });

export const stateMoved = ({ before, after, dimension, from, to }) => stateOf(before)?.[dimension] === from && stateOf(after)?.[dimension] === to;
