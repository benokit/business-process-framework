import { findElement, getElement } from '@business-framework/core';
import { isInstanceOf, selfOf, selvesOf } from '@business-framework/core/kinds';
import { slotValues } from '@business-framework/core/slots';
import { applyMapping } from '@business-framework/core/mappings';
import { resolveReference } from '@business-framework/core/references';
import { memo } from '@business-framework/core/registry';
import { mappingType, operationInputType } from '@business-framework/core/data-flow';

const OPEN = { type: 'object' };

const WILDCARD = '*';

const ANY = '(any)';

const isDecidedLater = dimension => dimension.values !== undefined;

const namedValues = dimension => isDecidedLater(dimension) ? applyMapping({ mapping: dimension.values, input: null }) : [];

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
    const typedDimensions = dimensions.filter(dimension => !isDecidedLater(dimension))
        .map(dimension => ({ dimension, ...dimensionType(endpoint, dimension, operation, scope) }));
    return {
        id: endpoint.id,
        values: {
            ...Object.fromEntries(dimensions.filter(isDecidedLater).map(({ name }) => [name, [ANY]])),
            ...Object.fromEntries(typedDimensions.map(({ dimension, type }) => [dimension.name, (type && valuesOf(type)) ?? []]))
        },
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
        const values = [...new Set([...namedValues(dimension), ...endpoints.flatMap(({ values }) => values[dimension.name]).filter(value => value !== ANY)])];
        return [dimension.name, new Map(values.map(value => [value, ancestors(dimension, value)]))];
    });
    return { dimensions, endpoints, performed: Object.fromEntries(performed) };
});

const coveredBy = (performed, value) => [...performed]
    .filter(([performedValue, above]) => performedValue === value || above.includes(value))
    .map(([performedValue]) => performedValue);

const EXCEPT = 'except';

const unknownDimensions = (performed, holder, box) => Object.keys(box).filter(name => !(name in performed))
    .map(name => `${holder.id}: a grant names an unknown dimension ${name}`);

const grantProblems = (performed, holder) => (holder.data.grants ?? []).flatMap(({ [EXCEPT]: excepted = [], ...box }) => [
    ...unknownDimensions(performed, holder, box),
    ...excepted.flatMap(except => unknownDimensions(performed, holder, except)),
    ...Object.entries(box).filter(([name]) => name in performed).flatMap(([name, value]) => [value].flat()
        .filter(named => named !== WILDCARD && coveredBy(performed[name], named).length === 0)
        .map(named => `${holder.id}: grants ${name} ${named}, which no endpoint performs`))
]);

const repeated = dimensions => dimensions.map(({ name }) => name)
    .filter((name, index, names) => names.indexOf(name) !== index)
    .map(name => `the dimension ${name} is declared twice`);


const edgesOf = (performed, value) => value === undefined || [value].flat().includes(WILDCARD)
    ? [WILDCARD]
    : [...new Set([value].flat().flatMap(named => coveredBy(performed, named)))];

const node = () => ({ children: new Map(), holders: new Set() });

const insert = (at, paths, holder) => {
    if (paths.length === 0) return at.holders.add(holder);
    const [edges, ...rest] = paths;
    edges.forEach(edge => {
        if (!at.children.has(edge)) at.children.set(edge, node());
        insert(at.children.get(edge), rest, holder);
    });
};

const actorsOf = role => role.data.actors ?? [];

const includedOf = id => findElement(id) ? selfOf(getElement(id)).data.roles ?? [] : [];

const rolesWithin = (id, path = []) => path.includes(id) || !findElement(id)
    ? []
    : [...new Set([id, ...includedOf(id).flatMap(included => rolesWithin(included, [...path, id]))])];

const cycleThrough = (start, id = start, path = []) => {
    if (path.length > 0 && id === start) return [...path, id];
    if (path.includes(id)) return undefined;
    return includedOf(id).map(included => cycleThrough(start, included, [...path, id])).find(Boolean);
};

const cycleProblems = () => selvesOf('role').map(role => cycleThrough(role.id)).filter(Boolean)
    .map(cycle => `${cycle[0]}: includes itself through ${cycle.join(' > ')}`);

const ownGrantsOf = role => [...actorsOf(role).flatMap(actor => selfOf(getElement(actor)).data.grants), ...role.data.grants ?? []];

const grantsOf = role => rolesWithin(role.id).flatMap(id => ownGrantsOf(selfOf(getElement(id))));

const isAll = edges => edges.includes(WILDCARD);

const intersection = (a, b) => isAll(a) ? b : isAll(b) ? a : a.filter(edge => b.includes(edge));

const difference = (all, a, b) => isAll(b) ? [] : (isAll(a) ? all : a).filter(edge => !b.includes(edge));

const minus = alls => (boxes, excepted) => boxes.flatMap(box => {
    if (box.some((edges, index) => intersection(edges, excepted[index]).length === 0)) return [box];
    return box.map((_, split) => box.map((edges, index) => {
        if (index < split) return intersection(edges, excepted[index]);
        return index === split ? difference(alls[index], edges, excepted[index]) : edges;
    })).filter(part => part.every(edges => edges.length > 0));
});

const boxesOf = (dimensions, performed, { [EXCEPT]: excepted = [], ...grant }) => {
    const boxOf = values => dimensions.map(({ name }) => edgesOf(performed[name], values[name]));
    const alls = dimensions.map(({ name }) => [...performed[name].keys()]);
    return excepted.map(boxOf).reduce(minus(alls), [boxOf(grant)]);
};

const trieOf = (authorization, holders) => {
    const { dimensions, performed } = spaceOf(authorization);
    const root = node();
    holders.forEach(({ id, grants }) => grants.forEach(grant =>
        boxesOf(dimensions, performed, grant).forEach(box => insert(root, box, id))));
    return root;
};

const roleTrie = memo(authorization => trieOf(authorization, selvesOf('role').map(role => ({ id: role.id, grants: grantsOf(role) }))));

const actorTrie = memo(authorization => trieOf(authorization, selvesOf('actor').map(actor => ({ id: actor.id, grants: actor.data.grants }))));

const edgesToFollow = (at, value) => value === ANY ? [...at.children.keys()] : [value, WILDCARD].filter(edge => at.children.has(edge));

const reached = (at, values) => {
    if (values.length === 0) return [at.holders];
    const [value, ...rest] = values;
    return edgesToFollow(at, value).flatMap(edge => reached(at.children.get(edge), rest));
};

const product = lists => lists.reduce((tuples, list) => tuples.flatMap(tuple => list.map(value => [...tuple, value])), [[]]);

const coverage = (trie, operations) => {
    const counts = operations.map(values => new Set(reached(trie, values).flatMap(holders => [...holders])))
        .flatMap(holders => [...holders])
        .reduce((all, holder) => ({ ...all, [holder]: (all[holder] ?? 0) + 1 }), {});
    return Object.fromEntries(Object.entries(counts).map(([holder, count]) => [holder, count === operations.length ? 'all' : 'some']));
};

const operationsOf = (dimensions, endpoint) => product(dimensions.map(({ name }) => endpoint.values[name]));

const endpointCoverage = (authorization, trie) => {
    const { dimensions, endpoints } = spaceOf(authorization);
    return endpoints.map(endpoint => ({ ...endpoint, holders: coverage(trie, operationsOf(dimensions, endpoint)) }));
};

const ungranted = authorization => endpointCoverage(authorization, actorTrie(authorization))
    .filter(({ holders }) => Object.keys(holders).length === 0)
    .map(({ id }) => ({ warning: `${id}: no actor grants its operation` }));

export const authorizationProblems = authorization => {
    const { dimensions, endpoints, performed } = spaceOf(authorization);
    return [
        ...repeated(dimensions),
        ...endpoints.flatMap(({ problems }) => problems),
        ...[...selvesOf('actor'), ...selvesOf('role')].flatMap(holder => grantProblems(performed, holder)),
        ...cycleProblems(),
        ...ungranted(authorization)
    ];
};

const reachable = (authorization, trie, id) => Object.fromEntries(endpointCoverage(authorization, trie)
    .filter(({ holders }) => id in holders)
    .map(endpoint => [endpoint.id, endpoint.holders[id]]));

const endpointExplanation = (authorization, endpoint) => {
    if (endpoint.data.public) return 'public';
    const covered = trie => endpointCoverage(authorization, trie).find(({ id }) => id === endpoint.id);
    const operations = covered(roleTrie(authorization));
    return operations && { operation: operations.values, actors: covered(actorTrie(authorization)).holders, roles: operations.holders };
};

const EXPLAINED = {
    'http-endpoint': endpointExplanation,
    actor: (authorization, actor) => ({
        endpoints: reachable(authorization, actorTrie(authorization), actor.id),
        roles: selvesOf('role').filter(role => rolesWithin(role.id).some(id => actorsOf(selfOf(getElement(id))).includes(actor.id))).map(role => role.id)
    }),
    role: (authorization, role) => ({
        actors: actorsOf(role),
        grants: role.data.grants ?? [],
        roles: includedOf(role.id),
        includedBy: selvesOf('role').filter(other => other.id !== role.id && rolesWithin(other.id).includes(role.id)).map(other => other.id),
        endpoints: reachable(authorization, roleTrie(authorization), role.id)
    })
};

export const authorizationExplanation = ({ authorization, element }) => {
    const found = findElement(element);
    const kind = found && Object.keys(EXPLAINED).find(name => isInstanceOf({ element, kind: name }));
    return kind ? { authorization: EXPLAINED[kind](authorization, selfOf(found)) ?? null } : null;
};

const theAuthorization = () => resolveReference({ instanceOf: 'authorization' });

export const permits = ({ operation, roles }) => {
    const authorization = theAuthorization();
    const values = dimensionsOf(authorization).map(dimension => operation[dimension.name] ?? (isDecidedLater(dimension) ? ANY : undefined));
    return reached(roleTrie(authorization), values).some(granted => roles.some(role => granted.has(role)));
};

export const endpointOperation = ({ endpoint, request }) => {
    const { data } = selfOf(getElement(endpoint));
    const scope = { params: request.params, query: request.query, headers: request.headers, input: applyMapping({ mapping: data.request ?? '#.body', input: request }) };
    const named = applyMapping({ mapping: data.operation, input: scope });
    return Object.fromEntries(dimensionsOf(theAuthorization()).map(dimension =>
        [dimension.name, named[dimension.name] ?? (dimension.default === undefined ? null : applyMapping({ mapping: dimension.default, input: scope }))]));
};
