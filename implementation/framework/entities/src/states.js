const matches = (from, dimensions) => Object.entries(from).every(([dimension, allowed]) => allowed.includes(dimensions[dimension]));

export const applyTransition = ({ model, state, transition }) => {
    const definition = model?.transitions?.[transition];
    if (!definition || !matches(definition.from, state.dimensions ?? {})) return null;
    return { dimensions: { ...state.dimensions, ...definition.to }, fromTransition: transition };
};

export const initialState = ({ model, name }) => ({ dimensions: model?.initialStates?.[name ?? 'default'] ?? {} });

const undeclared = (states, dimensions, where) => Object.entries(dimensions)
    .flatMap(([dimension, values]) => [values].flat()
        .filter(value => !(states[dimension] ?? []).includes(value))
        .map(value => `${where} uses undeclared state ${dimension}=${value}`));

export const checkStatesModel = model => model === undefined ? [] : [
    ...Object.entries(model.transitions ?? {}).flatMap(([name, { from, to }]) => [
        ...undeclared(model.states, from, `transition '${name}'`),
        ...undeclared(model.states, to, `transition '${name}'`)
    ]),
    ...Object.entries(model.initialStates ?? {}).flatMap(([name, dimensions]) => undeclared(model.states, dimensions, `initial state '${name}'`))
];
