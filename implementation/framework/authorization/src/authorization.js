import { getElement } from '@business-framework/core';
import { selfOf, selvesOf } from '@business-framework/core/kinds';
import { slotValues } from '@business-framework/core/slots';
import { applyMapping } from '@business-framework/core/mappings';
import { resolveReference } from '@business-framework/core/references';
import { memo } from '@business-framework/core/registry';
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
        values: Object.fromEntries(typedDimensions.map(({ dimension, type }) => [dimension.name, (type && valuesOf(type)) ?? []])),
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

const dimensionsOf = authorization => slotValues({ element: authorization, slot: 'dimensions' });

const operationEndpoints = () => selvesOf('http-endpoint').filter(endpoint => endpoint.data.operation !== undefined);

const spaceOf = memo(authorization => {
    const dimensions = dimensionsOf(authorization);
    const endpoints = operationEndpoints().map(endpoint => endpointSpace(dimensions, endpoint));
    const performed = dimensions.map(dimension => {
        const values = [...new Set(endpoints.flatMap(({ values }) => values[dimension.name]))];
        return [dimension.name, new Map(values.map(value => [value, ancestors(dimension, value)]))];
    });
    return { dimensions, endpoints, performed: Object.fromEntries(performed) };
});

const coveredBy = (performed, value) => [...performed]
    .filter(([performedValue, above]) => performedValue === value || above.includes(value))
    .map(([performedValue]) => performedValue);

const grantProblems = (performed, actor) => actor.data.grants.flatMap(grant => Object.entries(grant).flatMap(([name, value]) => {
    if (!(name in performed)) return [`${actor.id}: a grant names an unknown dimension ${name}`];
    return [value].flat().filter(named => named !== '*' && coveredBy(performed[name], named).length === 0)
        .map(named => `${actor.id}: grants ${name} ${named}, which no endpoint performs`);
}));

const repeated = dimensions => dimensions.map(({ name }) => name)
    .filter((name, index, names) => names.indexOf(name) !== index)
    .map(name => `the dimension ${name} is declared twice`);

export const authorizationProblems = authorization => {
    const { dimensions, endpoints, performed } = spaceOf(authorization);
    return [
        ...repeated(dimensions),
        ...endpoints.flatMap(({ problems }) => problems),
        ...selvesOf('actor').flatMap(actor => grantProblems(performed, actor))
    ];
};

const WILDCARD = '*';

const edgesOf = (performed, value) => value === undefined || [value].flat().includes(WILDCARD)
    ? [WILDCARD]
    : [...new Set([value].flat().flatMap(named => coveredBy(performed, named)))];

const insert = (node, paths, role) => {
    if (paths.length === 0) return node.roles.add(role);
    const [edges, ...rest] = paths;
    edges.forEach(edge => {
        if (!node.children.has(edge)) node.children.set(edge, { children: new Map(), roles: new Set() });
        insert(node.children.get(edge), rest, role);
    });
};

const grantsOf = role => role.data.actors.flatMap(actor => selfOf(getElement(actor)).data.grants);

const trieOf = memo(authorization => {
    const { dimensions, performed } = spaceOf(authorization);
    const root = { children: new Map(), roles: new Set() };
    selvesOf('role').forEach(role => grantsOf(role).forEach(grant =>
        insert(root, dimensions.map(({ name }) => edgesOf(performed[name], grant[name])), role.id)));
    return root;
});

const reached = (node, values) => {
    if (values.length === 0) return [node.roles];
    const [value, ...rest] = values;
    return [value, WILDCARD].filter(edge => node.children.has(edge)).flatMap(edge => reached(node.children.get(edge), rest));
};

const theAuthorization = () => resolveReference({ instanceOf: 'authorization' });

export const permits = ({ operation, roles }) => {
    const authorization = theAuthorization();
    const values = dimensionsOf(authorization).map(({ name }) => operation[name]);
    return reached(trieOf(authorization), values).some(granted => roles.some(role => granted.has(role)));
};

export const endpointOperation = ({ endpoint, request }) => {
    const { data } = selfOf(getElement(endpoint));
    const scope = { params: request.params, query: request.query, headers: request.headers, input: applyMapping({ mapping: data.request ?? '#.body', input: request }) };
    const named = applyMapping({ mapping: data.operation, input: scope });
    return Object.fromEntries(dimensionsOf(theAuthorization()).map(dimension =>
        [dimension.name, named[dimension.name] ?? (dimension.default === undefined ? null : applyMapping({ mapping: dimension.default, input: scope }))]));
};
