import { selvesOf } from '@business-framework/core/kinds';
import { slotValues } from '@business-framework/core/slots';
import { applyMapping } from '@business-framework/core/mappings';
import { mappingType, operationInputType } from '@business-framework/core/data-flow';

const OPEN = { type: 'object' };

const scopeType = target => ({
    type: 'object',
    properties: { params: OPEN, query: OPEN, headers: OPEN, input: operationInputType(target) },
    additionalProperties: false
});

const UNBOUNDED = new Set(['string', 'number', 'integer']);

const valuesOf = type => {
    if (Array.isArray(type.anyOf)) {
        const members = type.anyOf.map(valuesOf);
        return members.includes(undefined) ? undefined : members.flat();
    }
    if (typeof type.const === 'string') return [type.const];
    if (Array.isArray(type.enum)) return type.enum.filter(value => typeof value === 'string');
    if (type.type === undefined || UNBOUNDED.has(type.type)) return undefined;
    return [];
};

const typed = (code, scope) => {
    const { type, problems } = mappingType(code, scope);
    return { type, problems: problems.filter(problem => problem.code === 'unknown-path').map(problem => problem.message) };
};

const dimensionType = (endpoint, dimension, operation, scope) => {
    const own = operation.type.properties?.[dimension.name];
    if (own !== undefined) return { type: own, problems: [] };
    if (dimension.default !== undefined) return typed(dimension.default, scope);
    return { problems: [`${endpoint.id}: the operation names no ${dimension.name}`] };
};

const endpointSpace = (dimensions, endpoint) => {
    const scope = scopeType(endpoint.data.target);
    const operation = typed(endpoint.data.operation, scope);
    const names = dimensions.map(({ name }) => name);
    const unknown = Object.keys(operation.type.properties ?? {}).filter(name => !names.includes(name))
        .map(name => `${endpoint.id}: the operation names an unknown dimension ${name}`);
    const typedDimensions = dimensions.map(dimension => ({ dimension, ...dimensionType(endpoint, dimension, operation, scope) }));
    return {
        values: typedDimensions.map(({ dimension, type }) => [dimension.name, type && valuesOf(type)]),
        problems: [
            ...operation.problems.map(message => `${endpoint.id}: ${message}`),
            ...unknown,
            ...typedDimensions.flatMap(({ dimension, type, problems }) => [
                ...problems,
                ...type && valuesOf(type) === undefined ? [`${endpoint.id}: the ${dimension.name} is not a closed set of values`] : []
            ])
        ]
    };
};

const ancestors = (dimension, value, seen = new Set()) => {
    if (dimension.parents === undefined) return [];
    return (applyMapping({ mapping: dimension.parents, input: value }) ?? [])
        .filter(parent => !seen.has(parent))
        .flatMap(parent => [parent, ...ancestors(dimension, parent, seen.add(parent))]);
};

export const dimensionsOf = authorization => slotValues({ element: authorization, slot: 'dimensions' });

const operationEndpoints = () => selvesOf('http-endpoint').filter(endpoint => endpoint.data.operation !== undefined);

const spaceOf = (dimensions, spaces) => Object.fromEntries(dimensions.map(dimension => {
    const values = spaces.flatMap(({ values }) => values.find(([name]) => name === dimension.name)[1] ?? []);
    return [dimension.name, new Set(values.flatMap(value => [value, ...ancestors(dimension, value)]))];
}));

const grantProblems = (space, actor) => actor.data.grants.flatMap(grant => Object.entries(grant).flatMap(([name, value]) => {
    if (!(name in space)) return [`${actor.id}: a grant names an unknown dimension ${name}`];
    return [value].flat().filter(named => named !== '*' && !space[name].has(named))
        .map(named => `${actor.id}: grants ${name} ${named}, which no endpoint performs`);
}));

const repeated = dimensions => dimensions.map(({ name }) => name)
    .filter((name, index, names) => names.indexOf(name) !== index)
    .map(name => `the dimension ${name} is declared twice`);

export const authorizationProblems = authorization => {
    const dimensions = dimensionsOf(authorization);
    const spaces = operationEndpoints().map(endpoint => endpointSpace(dimensions, endpoint));
    const space = spaceOf(dimensions, spaces);
    return [
        ...repeated(dimensions),
        ...spaces.flatMap(({ problems }) => problems),
        ...selvesOf('actor').flatMap(actor => grantProblems(space, actor))
    ];
};
