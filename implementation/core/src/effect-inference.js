import { get, isPlainObject } from 'lodash-es';
import { allElements, findElement } from './registry.js';
import { instancesOf, resolveKind, selfOf } from './kinds.js';
import { fillsOf } from './slots.js';
import { isKindReference, resolveReference } from './references.js';
import { formOf, pipelinesOf, templatePositions } from './code.js';
import { EFFECTS, nodeForms, PIPELINE_KEYS } from './execution/nodes/forms.js';
import { fail } from './errors.js';

const LATER = 'later:';

const UNKNOWN = EFFECTS.filter(effect => effect !== 'trace');

const effectsFrom = (effects, trace) => new Map(effects.map(effect => [effect, trace]));

const union = maps => maps.reduce((all, map) => new Map([...map, ...all]), new Map());

const traced = (map, hop) => new Map([...map].map(([effect, trace]) => [effect, `${hop} > ${trace}`]));

const deferred = map => new Map([...map].map(([effect, trace]) => [effect.startsWith(LATER) ? effect : `${LATER}${effect}`, trace]));

const classOf = effect => effect.startsWith(LATER) ? effect.slice(LATER.length) : effect;

const classesOf = map => [...new Set([...map.keys()].map(classOf))].sort((a, b) => EFFECTS.indexOf(a) - EFFECTS.indexOf(b));

const tracesByClass = map => classesOf(map).map(effect => [effect, map.get(effect) ?? map.get(`${LATER}${effect}`)]);

const isStatic = value => typeof value === 'string' && /^#\.(self|node)(\.|$)/.test(value);

const valueOf = (value, ctx) => get({ self: ctx.self, node: ctx.node }, value.slice(2));

const selvesNamed = value => {
    if (isKindReference(value)) {
        try {
            return [selfOf(findElement(resolveReference(value)))];
        } catch {
            return instancesOf(value.instanceOf).filter(element => element.id !== undefined).map(selfOf);
        }
    }
    const element = typeof value === 'string' ? findElement(value) : undefined;
    return element && element.kind !== 'kind' ? [selfOf(element)] : undefined;
};

const inputField = (schema, field) => {
    const shape = typeof schema === 'string' && schema.startsWith('@') ? findElement(schema.slice(1))?.data : schema;
    const key = Object.keys(isPlainObject(shape) ? shape : {}).find(name => name.replace(/^!/, '').replace(/[=[{].*$/, '') === field);
    return key && shape[key];
};

const targetsOf = (target, ctx) => {
    if (isStatic(target)) return selvesNamed(valueOf(target, ctx));
    const field = typeof target === 'string' && target.match(/^#\.input\.([\w-]+)$/)?.[1];
    if (field) {
        const kind = String(inputField(ctx.input, field) ?? '').match(/^@ref\/([^/]+)$/)?.[1];
        return kind && instancesOf(kind).filter(element => element.id !== undefined).map(selfOf);
    }
    if (typeof target === 'string' && /^[#@]/.test(target)) return undefined;
    return selvesNamed(typeof target === 'string' ? target.replace(/^\\/, '') : target);
};

const operationsOf = (operation, self, ctx) => {
    if (isStatic(operation)) return [valueOf(operation, ctx)];
    if (typeof operation === 'string' && !/^[#@]/.test(operation)) return [operation.replace(/^\\/, '')];
    return Object.keys(resolveKind(self.kind).operations);
};

const slotCalls = tree => {
    if (Array.isArray(tree)) return tree.flatMap(slotCalls);
    if (!isPlainObject(tree) || '$literal' in tree) return [];
    return [
        ...isPlainObject(tree['$func/slot-values']) ? [tree['$func/slot-values']] : [],
        ...Object.values(tree).flatMap(slotCalls)
    ];
};

const ownExpressions = (node, keyword, template) => template
    ? [node.inputMap]
    : ['inputMap', keyword, ...nodeForms[keyword] ?? []].filter(key => !PIPELINE_KEYS.includes(key)).map(key => node[key]);

const analysis = () => {
    const operations = new Map();
    const problems = new Map();

    const operationEffects = (self, operation) => {
        const key = `${self.id} ${operation}`;
        if (!operations.has(key)) {
            operations.set(key, new Map());
            const kind = resolveKind(self.kind);
            const owner = kind.chain.findLast(k => k.data.operations?.[operation]?.implementation);
            const code = owner?.data.operations[operation].implementation;
            const ctx = { self, input: kind.operations[operation]?.input, author: owner?.id };
            operations.set(key, code === undefined ? new Map() : pipelineEffects(code, ctx, `operations.${operation}.implementation`));
        }
        return operations.get(key);
    };

    const fillEffects = (self, fill) => traced(pipelineEffects(fill.data.value, { self, author: fill.id ?? `a fill of ${fill.data.slot}` }, 'value'), `fill ${fill.id ?? fill.data.slot}`);

    const slotEffects = ({ element, slot }, ctx) => {
        const self = element === '#.self.id' ? ctx.self : selvesNamed(element)?.[0];
        if (self === undefined || typeof slot !== 'string') return new Map();
        if (!resolveKind(self.kind).slots[slot]) return new Map();
        const { declaration, fills } = fillsOf(self, slot);
        return declaration.value === '@method' ? union(fills.map(fill => fillEffects(self, fill))) : new Map();
    };

    const invokeEffects = (node, ctx) => {
        const targets = targetsOf(node.invoke, ctx);
        if (targets === undefined) return effectsFrom(UNKNOWN, `invoke ${JSON.stringify(node.invoke)}`);
        return union(targets.flatMap(self => operationsOf(node.operation, self, ctx)
            .map(operation => traced(operationEffects(self, operation), `${self.id}.${operation}`))));
    };

    const boundProblems = (bound, inner, keyword, ctx, path) => [...inner]
        .filter(([effect]) => !effect.startsWith(LATER) && !bound.includes(effect))
        .map(([effect, trace]) => [`${ctx.self.id} ${path} (${ctx.author}): ${keyword} allows ${bound.join(', ')}, not ${effect}: ${trace}`,
            { element: ctx.self.id, author: ctx.author, path, effect, trace }])
        .forEach(([message, data]) => problems.set(message, data));

    const templateEffects = (node, keyword, template, ctx, path) => {
        const inner = union((template.data.node
            ? templatePositions(node, template, path).filter(({ type }) => type === 'method')
            : [{ code: node[keyword], path: `${path}.${keyword}` }])
            .map(position => pipelineEffects(position.code, ctx, position.path)));
        const { bound, defers } = template.data.effects ?? {};
        if (bound) boundProblems(bound, inner, keyword, ctx, path);
        const implementation = pipelineEffects(template.data.implementation, { self: ctx.self, node, author: template.id }, 'implementation');
        return union([traced(implementation, keyword), defers ? deferred(traced(inner, keyword)) : inner]);
    };

    const keywordEffects = (node, keyword, template, ctx, path) => {
        if (template) return templateEffects(node, keyword, template, ctx, path);
        if (keyword === 'low') return effectsFrom(node.low?.effects ?? UNKNOWN, `low ${node.low?.export}`);
        if (keyword === 'invoke') return invokeEffects(node, ctx);
        if (keyword === 'execute') return isStatic(node.execute) ? pipelineEffects(valueOf(node.execute, ctx) ?? [], ctx, `${path}.execute`) : new Map();
        const branches = pipelinesOf(node, keyword);
        if (keyword === 'if' && isStatic(node.if)) {
            const taken = valueOf(node.if, ctx) ? 'then' : 'else';
            return union(branches.filter(([key]) => key === taken).map(([key, pipeline]) => pipelineEffects(pipeline, ctx, `${path}.${key}`)));
        }
        return union(branches.map(([key, pipeline]) => pipelineEffects(pipeline, ctx, `${path}.${key}`)));
    };

    const nodeEffects = (node, ctx, path) => {
        if (!isPlainObject(node)) return new Map();
        const { keyword, template } = formOf(node);
        return union([
            ...slotCalls(ownExpressions(node, keyword, template)).map(call => slotEffects(call, ctx)),
            keyword === undefined ? new Map() : keywordEffects(node, keyword, template, ctx, path)
        ]);
    };

    const pipelineEffects = (pipeline, ctx, path) => Array.isArray(pipeline)
        ? union(pipeline.map((node, index) => nodeEffects(node, ctx, `${path}[${index}]`)))
        : nodeEffects(pipeline, ctx, path);

    return { operationEffects, fillEffects, problems };
};

const instances = () => allElements().filter(element => element.id !== undefined && element.kind !== 'kind').map(selfOf);

const fillBoundProblems = ({ fillEffects }) => instances().flatMap(self =>
    Object.entries(resolveKind(self.kind).slots).filter(([, declaration]) => declaration.effects)
        .flatMap(([slot, { effects: bound }]) => fillsOf(self, slot).fills.flatMap(fill =>
            tracesByClass(fillEffects(self, fill)).filter(([effect]) => !bound.includes(effect)).map(([effect, trace]) => [
                `${fill.id ?? `a fill of ${slot}`} on ${self.id}: slot '${slot}' allows ${bound.join(', ')}, not ${effect}: ${trace}`,
                { element: fill.id, slot, target: self.id, effect, trace }
            ]))));

export const effectProblems = () => {
    const run = analysis();
    instances().forEach(self => Object.keys(resolveKind(self.kind).operations).forEach(operation => run.operationEffects(self, operation)));
    return [...new Map([...run.problems, ...fillBoundProblems(run)])].map(([message, data]) => () => fail('effect-bound', message, data));
};

const effectMapOf = ({ element, operation }) => analysis().operationEffects(selfOf(findElement(element)), operation);

export const effectsOf = request => classesOf(effectMapOf(request));

export const effectTracesOf = request => Object.fromEntries(tracesByClass(effectMapOf(request)));

export const changesOf = request => findElement(request.element)
    ? Object.entries(effectTracesOf(request)).filter(([effect]) => ['write', 'irreversible'].includes(effect)).map(([effect, trace]) => `${effect}: ${trace}`)
    : [];
