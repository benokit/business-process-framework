import { infer, typed } from 'lambdajson-js';
import { isPlainObject, mapValues, uniqBy } from 'lodash-es';
import { allElements, findElement, kindOf, lazy, memo } from './registry.js';
import { extendsKind, instancesOf, resolveKind } from './kinds.js';
import { schemaRef, standardOf, storedSchema } from './schemas.js';
import { codeOf, formOf, problem, targetKind, templatePositions } from './code.js';
import { isKindReference } from './references.js';

const ANY = {};
const NULL = { type: 'null' };
const NEVER = { enum: [] };
const STRING = { type: 'string' };
const OBJECT = { type: 'object' };

const anyOf = (...types) => ({ anyOf: types });
const arrayOf = items => ({ type: 'array', items });
const closed = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const isAny = type => isPlainObject(type) && Object.keys(type).length === 0;
const isObject = type => type.type === 'object' || (type.type === undefined && (type.properties !== undefined || type.required !== undefined));

const ERROR = { type: 'object', properties: { code: STRING, message: STRING, data: ANY }, required: ['message'] };

const intersect = (a, b) => {
    if (isAny(a)) return b;
    if (isAny(b)) return a;
    if (!isObject(a) || !isObject(b)) return ANY;
    const shared = Object.keys(a.properties ?? {}).filter(key => key in (b.properties ?? {}));
    return {
        type: 'object',
        properties: { ...a.properties, ...b.properties, ...Object.fromEntries(shared.map(key => [key, intersect(a.properties[key], b.properties[key])])) },
        required: [...new Set([...a.required ?? [], ...b.required ?? []])],
        ...a.additionalProperties === false || b.additionalProperties === false
            ? { additionalProperties: false }
            : { additionalProperties: a.additionalProperties ?? b.additionalProperties }
    };
};

const REFERENCE = /^\/ref\/(?!kind(\/|$))(.+)$/;

const idsOf = elements => elements.map(({ id }) => id).filter(id => id !== undefined);

const referenceType = memo(kind => findElement(kind)?.kind === 'kind'
    ? anyOf(
        { type: 'string', enum: idsOf(instancesOf(kind)) },
        { type: 'object', properties: { instanceOf: { type: 'string', enum: idsOf(instancesOf('kind').filter(({ id }) => extendsKind(id, kind))) } }, required: ['instanceOf'] })
    : ANY);

const typeOf = (schema, seen = []) => {
    if (!isPlainObject(schema)) return schema === false ? NEVER : ANY;
    const referenced = typeof schema.$ref === 'string' ? REFERENCE.exec(schema.$ref)?.[2] : undefined;
    if (referenced !== undefined) return referenceType(referenced);
    if (typeof schema.$ref === 'string') {
        return schema.$ref.startsWith('#') || seen.includes(schema.$ref) ? ANY : typeOf(storedSchema(schema.$ref), [...seen, schema.$ref]);
    }
    const nested = part => typeOf(part, seen);
    const { allOf, anyOf: any, oneOf, properties, items, prefixItems, additionalProperties, ...rest } = schema;
    const own = {
        ...rest,
        ...any || oneOf ? { anyOf: [...any ?? [], ...oneOf ?? []].map(nested) } : {},
        ...properties ? { properties: mapValues(properties, nested) } : {},
        ...items !== undefined ? { items: items === false ? false : nested(items) } : {},
        ...prefixItems ? { prefixItems: prefixItems.map(nested) } : {},
        ...additionalProperties !== undefined ? { additionalProperties: typeof additionalProperties === 'boolean' ? additionalProperties : nested(additionalProperties) } : {}
    };
    return (allOf ?? []).map(nested).reduce(intersect, own);
};

const closedType = type => {
    if (!isPlainObject(type)) return type;
    const { properties, additionalProperties, items, prefixItems, anyOf: any } = type;
    return {
        ...type,
        ...properties ? { properties: mapValues(properties, closedType) } : {},
        ...additionalProperties === undefined ? properties ? { additionalProperties: false } : {} : { additionalProperties: closedType(additionalProperties) },
        ...isPlainObject(items) ? { items: closedType(items) } : {},
        ...prefixItems ? { prefixItems: prefixItems.map(closedType) } : {},
        ...any ? { anyOf: any.map(closedType) } : {}
    };
};

const schemaType = memo(id => closedType(typeOf({ $ref: schemaRef(id) })));

const compactType = schema => schema === undefined ? ANY : closedType(typeOf(standardOf(schema)));

const dataType = kindId => resolveKind(kindId).chain
    .filter(kind => kind.data.shape !== undefined)
    .map(kind => schemaType(kind.id))
    .reduce(intersect, OBJECT);

const selfType = memo(kindId => closed({ id: ANY, kind: STRING, data: dataType(kindId) }));

const ANY_SELF = closed({ id: ANY, kind: STRING, data: ANY });

const contextType = lazy(() => ({
    type: 'object',
    properties: Object.assign({}, ...instancesOf('kind')
        .filter(kind => kind.data.context?.manages !== undefined)
        .map(kind => schemaType(`${kind.id}/context/manages`).properties ?? {})),
    additionalProperties: false
}));

const slotsNamed = slot => uniqBy(instancesOf('kind').map(kind => resolveKind(kind.id).slots[slot]).filter(Boolean), 'owner');

const slotValueType = memo(slot => {
    const declarations = slotsNamed(slot);
    if (declarations.length === 0) return ANY;
    return anyOf(...declarations.map(({ owner, cardinality }) => {
        const value = schemaType(`${owner}/slots/${slot}`);
        return cardinality === 'one' ? anyOf(value, NULL) : arrayOf(value);
    }));
});

const slotValuesType = argument => typeof argument?.properties?.slot?.const === 'string' ? slotValueType(argument.properties.slot.const) : ANY;

const RESULT_TYPES = { 'slot-values': slotValuesType };

const pureFunctions = lazy(() => Object.fromEntries(instancesOf('pure-function').map(({ id, data: { signature } }) =>
    [`$func/${id}`, typed(argument => argument, { takes: compactType(signature?.input), returns: compactType(signature?.output) }, RESULT_TYPES[id])])));

const pathOf = (path, pointer) => pointer.split('/').slice(1)
    .map(step => step.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((at, step) => /^\d+$/.test(step) ? `${at}[${step}]` : `${at}.${step}`, path);

const expression = (walk, input, code, path) => {
    const { type, problems } = infer(code, { input, primitives: pureFunctions() });
    problems.forEach(({ severity, code: name, path: pointer, message }) =>
        walk.problems.push(problem(walk.at, pathOf(path, pointer), name, message.replace(/ \(at [^)]*\)$/, ''), { severity })));
    return type;
};

const literalOf = value => typeof value === 'string' && !/^[#@]/.test(value) ? value.replace(/^\\/, '') : undefined;

const invokedKind = (walk, target) => {
    if (isKindReference(target)) return findElement(target.instanceOf)?.kind === 'kind' ? target.instanceOf : undefined;
    if (target === '#.self.id') return walk.kind;
    const element = findElement(literalOf(target));
    return element && kindOf(element);
};

const outputOf = (walk, node) => {
    const kind = invokedKind(walk, node.invoke);
    const name = literalOf(node.operation);
    const operation = kind && name && resolveKind(kind).operations[name];
    return operation?.output === undefined ? ANY : schemaType(`${operation.owner}/${name}/output`);
};

const itemOf = type => infer({ $head: '#' }, { input: type }).type;

const withInput = (scope, input) => ({ ...scope, input });

const NODES = {
    set: (walk, node, scope, input, path) => expression(walk, closed(scope), node.set, `${path}.set`),
    if: (walk, node, scope, input, path) => {
        expression(walk, closed(scope), node.if, `${path}.if`);
        return anyOf(
            pipeline(walk, node.then, withInput(scope, input), `${path}.then`),
            node.else === undefined ? NULL : pipeline(walk, node.else, withInput(scope, input), `${path}.else`));
    },
    switch: (walk, node, scope, input, path) => {
        expression(walk, closed(scope), node.switch?.value, `${path}.switch.value`);
        const cases = Object.entries(node.switch?.cases ?? {});
        return anyOf(...cases.map(([name, cased]) => pipeline(walk, cased, withInput(scope, input), `${path}.switch.cases.${name}`)),
            ...'default' in (node.switch?.cases ?? {}) ? [] : [NULL]);
    },
    forEach: (walk, node, scope, input, path) => arrayOf(pipeline(walk, node.forEach, { ...scope, item: itemOf(input) }, `${path}.forEach`)),
    try: (walk, node, scope, input, path) => {
        const inner = withInput(scope, input);
        const result = pipeline(walk, node.try, inner, `${path}.try`);
        const caught = node.catch === undefined ? NEVER : pipeline(walk, node.catch, { ...inner, error: ERROR }, `${path}.catch`);
        if (node.finally !== undefined) pipeline(walk, node.finally, inner, `${path}.finally`);
        return anyOf(result, caught);
    },
    throw: (walk, node, scope, input, path) => {
        expression(walk, closed(scope), node.throw, `${path}.throw`);
        return NEVER;
    },
    return: (walk, node, scope, input, path) => {
        walk.returns.push(expression(walk, closed(scope), node.return, `${path}.return`));
        return NEVER;
    },
    invoke: (walk, node, scope, input, path) => {
        const target = expression(walk, closed(scope), node.invoke, `${path}.invoke`);
        walk.targets?.set(node, walk.targets.has(node) ? anyOf(walk.targets.get(node), target) : target);
        expression(walk, closed(scope), node.operation, `${path}.operation`);
        return outputOf(walk, node);
    },
    execute: (walk, node, scope, input, path) => {
        expression(walk, closed(scope), node.execute, `${path}.execute`);
        return ANY;
    },
    low: () => ANY,
    withContext: (walk, node, scope, input, path) => {
        expression(walk, closed(scope), node.withContext, `${path}.withContext`);
        return pipeline(walk, node.do, withInput(scope, input), `${path}.do`);
    },
    middleware: (walk, node, scope, input, path) => {
        expression(walk, closed(scope), node.middleware, `${path}.middleware`);
        pipeline(walk, node.action, withInput(scope, input), `${path}.action`);
        return ANY;
    },
    next: walk => walk.next ?? ANY
};

const isWrapper = template => extendsKind(kindOf(template), 'execution-node-wrapper');

const silent = walk => ({ ...walk, problems: [] });

const implementationType = (walk, template, scope, input, next) => method(silent(walk), template.data.implementation,
    { input, self: scope.self, _ctx: scope._ctx, operation: STRING, node: template.data.node ? schemaType(`${template.id}/node`) : ANY }, 'implementation', next);

const templateNode = (walk, node, scope, input, path, keyword, template) => {
    const runs = isWrapper(template) ? `${path}.${keyword}` : undefined;
    const positions = template.data.node ? templatePositions(node, template, path) : runs ? [{ type: 'method', code: node[keyword], path: runs }] : [];
    const next = positions.reduce((type, position) => {
        if (position.type === 'mapping') expression(walk, ANY, position.code, position.path);
        if (position.type !== 'method') return type;
        const own = position.path === runs;
        const output = method(walk, position.code, own ? withInput(scope, input) : { input, self: scope.self, _ctx: scope._ctx }, position.path);
        return own ? output : type;
    }, ANY);
    return implementationType(walk, template, scope, input, runs ? next : undefined);
};

const nodeType = (walk, node, scope, path) => {
    if (!isPlainObject(node)) return ANY;
    const { keywords, keyword, template } = formOf(node);
    const input = 'inputMap' in node ? expression(walk, closed(scope), node.inputMap, `${path}.inputMap`) : scope.input;
    if (keywords.length !== 1) return ANY;
    return template ? templateNode(walk, node, scope, input, path, keyword, template) : NODES[keyword](walk, node, scope, input, path);
};

const pipeline = (walk, code, scope, path) => {
    if (code === undefined) return NULL;
    if (!Array.isArray(code)) return nodeType(walk, code, scope, path);
    return code.reduce(({ scope: current }, node, index) => {
        const type = nodeType(walk, node, current, `${path}[${index}]`);
        const key = isPlainObject(node) && typeof node.outputKey === 'string' ? node.outputKey : undefined;
        return { scope: key === undefined ? current : { ...current, [key]: type }, type };
    }, { scope, type: NULL }).type;
};

const method = (walk, code, scope, path, next) => {
    const inner = { ...walk, returns: [], next };
    const output = pipeline(inner, code, scope, path);
    return anyOf(output, ...inner.returns);
};

const OPERATION = /^operations\.([^.]+)\.implementation$/;

const HOOK = /^lifecycle\.(load|start|stop)$/;

const contractInput = (kindId, name) => {
    const operation = resolveKind(kindId).operations[name];
    return operation?.input === undefined ? ANY : schemaType(`${operation.owner}/${name}/input`);
};

export const operationInputType = ({ element, operation }) => {
    const found = findElement(element);
    return found ? contractInput(kindOf(found), operation) : ANY;
};

export const mappingType = (code, input) => infer(code, { input, primitives: pureFunctions() });

const methodStart = (author, path) => {
    const _ctx = contextType();
    if (author.kind === 'kind') {
        const self = selfType(author.id);
        const operation = OPERATION.exec(path)?.[1];
        const input = operation ? contractInput(author.id, operation) : HOOK.test(path) ? NULL : ANY;
        return { kind: author.id, scope: { input, self, _ctx, ...operation && { operation: STRING } } };
    }
    if (extendsKind(kindOf(author), 'execution-node-template') && path === 'implementation') {
        return { scope: { input: ANY, self: ANY_SELF, _ctx, operation: STRING, node: author.data.node ? schemaType(`${author.id}/node`) : ANY } };
    }
    const kind = author.kind === 'slot-fill' ? fillTarget(author)?.id : kindOf(author);
    const input = author.kind === 'slot-fill' ? fillInput(author) : ANY;
    return { kind, scope: { input, self: kind ? selfType(kind) : ANY_SELF, _ctx } };
};

const fillTarget = fill => findElement(fill.data.target) && targetKind(fill.data.target);

const fillInput = fill => {
    const declaration = fillTarget(fill)?.slots[fill.data.slot];
    return declaration?.input === undefined ? ANY : schemaType(`${declaration.owner}/slots/${fill.data.slot}/input`);
};

const mappingInput = (author, path) => {
    if (author.kind === 'kind' && path === 'lifecycle.validate') return closed({ self: selfType(author.id) });
    if (author.kind === 'kind' && path === 'lifecycle.explain') return closed({ self: selfType(author.id), element: STRING });
    if (author.kind === 'pure-function' && path === 'mapping') return compactType(author.data.signature?.input);
    if (author.kind === 'slot-fill') return fillInput(author);
    return ANY;
};

const positionWalk = (author, targets) => ({ type, code, path }) => {
    const start = type === 'method' ? methodStart(author, path) : {};
    const walk = { at: { author }, kind: start.kind, problems: [], returns: [], targets };
    if (type === 'method') method(walk, code, start.scope, path);
    else expression(walk, mappingInput(author, path), code, path);
    return walk.problems;
};

export const flowProblems = author => {
    try {
        return codeOf(author).flatMap(positionWalk(author));
    } catch (error) {
        return [() => { throw error; }];
    }
};

const targetTypes = lazy(() => {
    const targets = new Map();
    allElements().forEach(author => {
        try {
            codeOf(author).forEach(positionWalk(author, targets));
        } catch {
            return;
        }
    });
    return targets;
});

const namesIn = member => {
    if (member.type === 'null' || (Array.isArray(member.enum) && member.enum.length === 0)) return [];
    if (typeof member.const === 'string') return [member.const];
    if (Array.isArray(member.enum) && member.enum.every(value => typeof value === 'string')) return member.enum;
    const kinds = member.type === 'object' ? member.properties?.instanceOf?.enum : undefined;
    return Array.isArray(kinds) ? kinds.flatMap(kind => idsOf(instancesOf(kind))) : undefined;
};

export const invokedNames = node => {
    const type = targetTypes().get(node);
    const names = type && (type.anyOf ?? [type]).map(namesIn);
    return names && !names.includes(undefined) ? [...new Set(names.flat())] : undefined;
};
