// Sketch of F18 dispatch. Not wired into the runtime: it shows how little native code
// "behaviour belongs to the kind" needs. `runPipeline` stands for executeMethod with
// `self` added to the execution context; `allElements` for a registry listing. One change to
// the executor is assumed: each node's mappings, and its low call, see
// visibleContext(node, _ctx) rather than the full _ctx (P13, below).

import { merge } from 'lodash-es';
import { getElement, getElementsOfKind } from '../../../implementation/runtime/src/elements-registry.js';
import { executeMapping } from '../../../implementation/runtime/src/execution.js';
import { executors } from '../../../implementation/runtime/src/executors.js';

// --- native schema registry (one AJV instance) -------------------------------
// add (the ajv element's operation): ajv.addSchema(compactToStandard(schema), id)   no compilation; any order
// validateById: ajv.getSchema(id)(value)     compiles on the first request, cached after that
import { validateById } from './native-schema.js';

// --- kinds -----------------------------------------------------------------

// An element without a kind has kind 'data'. An undefined kind is an error (A1), not silence.
// For 'kind' itself the chain is just [kind]: resolving reads data and runs nothing, so the
// fixed point doesn't regress.
function kindChain(kindId = 'data') {
    const chain = [];
    for (let id = kindId; id; ) {
        const k = getElement(id);
        if (!k || k.kind !== 'kind') throw `unknown kind '${id}'`;
        chain.unshift(k);                                 // most general first
        id = k.data.extends;
    }
    return chain;
}

const resolvedKinds = new Map();

// Operations are a primitive property of the kind (P8): collected along the chain, add-only (Q7).
function resolveKind(kindId) {
    if (resolvedKinds.has(kindId)) return resolvedKinds.get(kindId);
    const chain = kindChain(kindId);
    const kind = { ids: chain.map(k => k.id), chain, operations: {}, slots: {}, defaults: {}, manages: {}, reads: {} };
    for (const { id, data } of chain) {
        for (const [name, op] of Object.entries(data.operations ?? {})) {
            if (kind.operations[name]) throw `${id} may not override operation '${name}'`;
            kind.operations[name] = { ...op, owner: id };    // owner names the registered contract
        }
        for (const [name, slot] of Object.entries(data.slots ?? {})) {
            if (kind.slots[name]) throw `${id} may not redeclare slot '${name}'`;
            kind.slots[name] = { ...slot, owner: id };   // owner names the registered contract
        }
        merge(kind.defaults, data.defaults);              // P6 merge, general -> specific
        // Context rights (P13), add-only along the chain. A managed key maps to the kind whose
        // schema checks it. What a kind manages it also reads; readers name keys only.
        for (const key of Object.keys(data.context?.manages ?? {})) { kind.manages[key] = id; kind.reads[key] = true; }
        for (const key of data.context?.reads ?? []) kind.reads[key] = true;
    }
    // Slots declared from outside the kind (Q10), found through a lazy index of slot-declaration elements.
    for (const { data } of getElementsOfKind('slot-declaration').items) {
        if (!kind.ids.includes(data.target)) continue;
        if (kind.slots[data.slot]) throw `${data.target} already declares slot '${data.slot}'`;
        const { target, slot, ...declaration } = data;
        kind.slots[slot] = { ...declaration, owner: target };
    }
    resolvedKinds.set(kindId, kind);
    return kind;
}

// Computed once per element and frozen, so schemas inside it keep a stable identity.
const selves = new Map();

function selfOf(element) {
    if (!selves.has(element.id)) {
        const kind = resolveKind(element.kind);
        selves.set(element.id, Object.freeze({ id: element.id, kind: element.kind, data: merge({}, kind.defaults, element.data) }));
    }
    return selves.get(element.id);
}

const contractId = (owner, operation, part) => `${owner}/${operation}/${part}`;

// Off during the load phase: a validation mid-load could compile a schema before the
// schemas it references are added. The native validateSchema node honours it too.
let validating = false;

function check(schemaId, value, where) {
    if (!validating) return;
    const { isValid, errors } = validateById(schemaId, value);
    if (!isValid) throw `${where}: invalid ${schemaId}: ${JSON.stringify(errors)}`;
}

// --- invoke ----------------------------------------------------------------

// Operations are invoked through an instance (P8): the instance's kind chain provides them.
// #.self stays bound for the whole invocation, like _ctx: every pipeline run inside it
// (execute nodes, branches, forEach, slot fills) sees the same self, until the next invoke.
export async function invoke(elementId, operationName, input, _ctx) {
    const self = selfOf(getElement(elementId));
    const op = resolveKind(self.kind).operations[operationName];
    if (!op) throw `${elementId} has no operation '${operationName}'`;
    const where = `${elementId}.${operationName}`;
    check(contractId(op.owner, operationName, 'input'), input, where);
    const output = await runPipeline(op.implementation, { _ctx, input, self });
    if (op.output !== undefined) check(contractId(op.owner, operationName, 'output'), output, where); // A6
    return output;
}

executors.invoke = node => async (nodeInput, context) => {
    const elementId = await executeMapping(node.invoke, context);     // "construction" or "#.self.id"
    const operation = await executeMapping(node.operation, context);  // usually a literal
    return invoke(elementId, operation, nodeInput.input, context._ctx); // _ctx flows down, never back
};

// --- slots -----------------------------------------------------------------

// Base order of a 'many' slot: general -> specific target, then fill id (never load order).
// 'after' and 'before' override it where a real dependency exists: 'X before Y' is 'Y after X',
// one graph per slot (Q15). Ids naming fills that don't apply to this instance (another branch
// of the hierarchy) are ignored here; ids naming no fill of the slot at all, and cycles, are
// load errors (checked natively after load, for every instance).
function orderFills(fills, targets, slotName) {
    const byId = new Map(fills.filter(f => f.id).map(f => [f.id, f]));
    const base = [...fills].sort((a, b) =>
        targets.indexOf(a.data.target) - targets.indexOf(b.data.target) || (a.id ?? '').localeCompare(b.id ?? ''));
    const predecessors = new Map(base.map(f => [f, new Set()]));
    const band = f => ({ first: 0, last: 2 })[f.data.position] ?? 1;
    for (const f of base) {
        for (const g of base) if (band(g) < band(f)) predecessors.get(f).add(g);   // first -> unpositioned -> last
        for (const id of f.data.after ?? []) if (byId.has(id)) predecessors.get(f).add(byId.get(id));
        for (const id of f.data.before ?? []) if (byId.has(id)) predecessors.get(byId.get(id)).add(f);
    }
    const ordered = [];
    while (ordered.length < base.length) {                // stable topological sort over the base order
        const next = base.find(f => !ordered.includes(f) && [...predecessors.get(f)].every(p => ordered.includes(p)));
        if (!next) throw `cycle in the order of '${slotName}' fills`;     // also: after/before against the bands
        ordered.push(next);
    }
    return ordered;
}

// Slots are data (Q16): reading one is pure ($func/slot-values). The values of a 'many' slot
// come ordered; a 'one' slot gives the most specific value, or null.
export function slotValues({ input: { element, slot: slotName } }) {
    const self = selfOf(getElement(element));
    const kind = resolveKind(self.kind);
    const slot = kind.slots[slotName];
    if (!slot) throw `${self.kind} declares no slot '${slotName}'`;
    const targets = [...kind.ids, self.id];               // general -> specific
    const fills = instancesOf('slot-fill')
        .filter(f => f.data.slot === slotName && targets.includes(f.data.target));

    if (slot.cardinality === 'one') {                     // most specific target wins
        const target = targets.findLast(t => fills.some(f => f.data.target === t));
        if (target === undefined) return null;
        const candidates = fills.filter(f => f.data.target === target);
        if (candidates.length > 1) throw `${candidates.length} '${slotName}' fills target ${target}`;
        return candidates[0].data.value;
    }
    return orderFills(fills, targets, slotName).map(f => f.data.value);
}

// --- scoped context (F8) ------------------------------------------------------

// _ctx is read-only: pipelines read #._ctx, low nodes receive it frozen, and 'outputKey: "_ctx"'
// is a load error. A binding is visible only inside the subtree that made it, so nothing flows
// back up and nothing needs resetting: when the subtree returns, the outer _ctx is in effect
// again, because it was never changed.
const bind = (_ctx, bindings) => Object.freeze({ ..._ctx, ...bindings });   // shadows, shallow

// Context rights (P13) belong to the code's author: the element a pipeline is written in, not
// the instance it runs for. A guard written in an authorization-guard fill has that kind's
// rights, even while it runs inside entity-type.create. The loader records the author of every
// node object when it loads an element (pipelines are static data, F5), so the wrapped pipeline
// of inTransaction keeps its caller's rights and the wrapper's implementation has its own.
const authors = new WeakMap();                            // node object -> element

export function recordAuthors(element, value = element.data) {
    if (value && typeof value === 'object' && !authors.has(value)) {
        authors.set(value, element);                      // first writer wins (shared /ref data)
        Object.values(value).forEach(v => recordAuthors(element, v));
    }
}

// Code written in a kind (its operations and hooks) has the kind's rights; code written in any
// other element has its kind's rights.
const rightsOf = author => resolveKind(author.kind === 'kind' ? author.id : author.kind);

// What code sees as #._ctx (and what its low nodes receive): only the keys its author manages or
// reads. Everything else is carried on underneath, unseen, to the code it invokes.
export const visibleContext = (node, _ctx) =>
    Object.freeze(Object.fromEntries(Object.entries(_ctx).filter(([key]) => key in rightsOf(authors.get(node)).reads)));

// { "withContext": <mapping>, "do": <pipeline> }. The block runs in the current context (it
// sees the enclosing #.self, #.input and outputs, like an if branch) with the bindings added
// to _ctx. Its output is the node's output. Only keys the author manages may be bound, and each
// value is checked against the managing kind's schema.
executors.withContext = node => async (nodeInput, context) => {
    const bindings = await executeMapping(node.withContext, context);
    const rights = rightsOf(authors.get(node));
    for (const [key, value] of Object.entries(bindings)) {
        if (!rights.manages[key]) throw `${authors.get(node).id} may not bind context '${key}': it doesn't manage it`;
        check(`${rights.manages[key]}/context/manages`, { [key]: value }, `withContext '${key}'`);
    }
    return runPipeline(node.do, { ...context, _ctx: bind(context._ctx, bindings) });
};

// The root _ctx is empty: the native http server and the lifecycle driver pass {}. Every key is
// bound by its manager around the code that needs it: request by http-endpoint.handle, user by
// the user-scope wrappers, transaction by inTransaction. Configuration is not context
// ($func/app-config).

// After load: every context key has one hierarchy tree of managers. All kinds that declare a key
// in 'manages' must extend the most general of them. No managed key is required: code may not
// demand context it doesn't manage, and even a manager checks before it binds. Every key read
// is managed somewhere, so a typo ('usr') is an error.
function checkContextDeclarations() {
    const managers = {}, readers = {};
    for (const k of instancesOf('kind')) {
        for (const key of Object.keys(k.data.context?.manages ?? {})) {
            if (key.startsWith('!')) throw `${k.id}: context '${key.slice(1)}' can't be required`;
            (managers[key] ??= []).push(k.id);
        }
        for (const key of k.data.context?.reads ?? []) (readers[key] ??= []).push(k.id);
    }
    for (const [key, ids] of Object.entries(managers)) {
        const root = ids.find(id => ids.every(other => resolveKind(other).ids.includes(id)));
        if (!root) throw `context '${key}' is managed by unrelated kinds: ${ids.join(', ')}`;
    }
    for (const [key, ids] of Object.entries(readers)) {
        if (!managers[key]) throw `${ids.join(', ')} read context '${key}', which no kind manages`;
    }
}

// --- middleware ------------------------------------------------------------

// { "middleware": <expr: list of methods>, "action": <pipeline>, "inputMap": ... }
// Runs the first method with the node's input. Inside a method, { "next": true } (with an
// optional inputMap) continues with the next method, and after the last one with 'action'.
// next returns what the rest of the chain returned, so a method can act before and after it,
// change its input or output, skip it (short-circuit) or call it more than once (retry).
// Native, because a continuation in data would mean passing pipelines around as values, which
// brings back the quoting of A5. The chain itself is static data (slot values), not built at
// run time (F5).
const NEXT = Symbol('next');

// next carries the _ctx current where it is called, so a middleware binds context for the rest of
// the chain with { "withContext": …, "do": { "next": true } }: one binding mechanism, no extra
// option on next.
executors.middleware = node => async (nodeInput, context) => {
    const chain = (await executeMapping(node.middleware, context)) ?? [];
    const run = (i, input, _ctx) => i === chain.length
        ? runPipeline(node.action, { ...context, input, _ctx })     // the owner's action sees the owner's context
        : runPipeline(chain[i], {                                    // a middleware sees only its input, self and _ctx
            _ctx, self: context.self, input,
            [NEXT]: (nextInput, nextCtx) => run(i + 1, nextInput, nextCtx)
        });
    return run(0, nodeInput.input, context._ctx);
};

// The continuation is scoped like #.self: visible in the middleware's nested branches, until a
// nested middleware node binds its own. Without an inputMap, next passes the middleware's #.input.
executors.next = node => async (nodeInput, context) => {
    const next = context[NEXT];
    if (!next) throw "'next' used outside a middleware";
    return next(nodeInput.input, context._ctx);
};

// An execution-node-wrapper is a one-method middleware around the keyword's value: next runs that
// pipeline in the caller's context, with the _ctx current at the call to next. So
// { "inTransaction": [ … ] } keeps #.self, #.change and earlier outputs, and sees
// _ctx.transaction. The wrapped pipeline is never passed around as a value (A5).
const wrapper = (template, node) => async (nodeInput, context) =>
    runPipeline(template.data.implementation, {
        _ctx: context._ctx, self: context.self, input: nodeInput.input, node,
        [NEXT]: (_, _ctx) => runPipeline(node[template.data.keyword], { ...context, _ctx })
    });

// A plain template runs in its own context: the keyword's value is configuration, read
// through #.node, and the caller's outputs are not visible.
const plainTemplate = (template, node) => async (nodeInput, context) =>
    runPipeline(template.data.implementation, { _ctx: context._ctx, self: context.self, input: nodeInput.input, node });

// The executor's fallback for a node key it doesn't know natively: find the template through
// the lazy keyword index (instances of execution-node-template and its subkinds), and choose by
// kind. The kind is the abstraction (F17): no flag in the data says how to run it.
const templatesByKeyword = lazyIndex('execution-node-template', t => t.data.keyword);

export function templateExecutor(keyword, node) {
    const template = templatesByKeyword().get(keyword);
    if (!template) throw `unknown node keyword '${keyword}'`;
    return (template.kind === 'execution-node-wrapper' ? wrapper : plainTemplate)(template, node);
}

// Instances of a kind and of its subkinds (fills of authorization-guard are fills too).
function instancesOf(kindId) {
    return allElements().filter(e => (e.kind === 'kind' && kindId === 'kind') ||
        (e.kind && e.kind !== 'kind' && kindChain(e.kind).some(k => k.id === kindId)));
}

// Built on first use, not registered at load (load hooks stay order-independent). Includes
// instances of subkinds; a key that occurs twice is an error.
function lazyIndex(kindId, keyOf) {
    let index;
    return () => index ??= instancesOf(kindId)
        .reduce((map, e) => {
            if (map.has(keyOf(e))) throw `${kindId}: '${keyOf(e)}' is defined twice`;
            return map.set(keyOf(e), e);
        }, new Map());
}

// --- lifecycle -------------------------------------------------------------

// Phases, each run for every element before the next phase starts:
//   load   make elements known to in-process subsystems (AJV addSchema); no I/O, no validation.
//          Hooks must not depend on each other's effects: they read element data (all loaded
//          before this phase), add to AJV (order-free), and use $func, keywords and slot fills,
//          which are lazy native views over the registry, not registrations.
//   start  effects: routes, consumers, startup pipelines (order between elements: Q8)
//   stop   effects, at shutdown
// Hooks along the kind chain all run, most general first. There is no special case for
// kinds: an element of kind 'kind' runs kind.lifecycle like any other element, and so
// does 'kind' itself. That is where shapes and operation contracts get added to AJV.
export async function runLifecycle(phase, _ctx = {}) {
    for (const element of allElements()) {
        const self = selfOf(element);
        for (const k of resolveKind(element.kind).chain) {
            const hook = k.data.lifecycle?.[phase];
            if (hook) await runPipeline(hook, { _ctx, self });
        }
    }

    if (phase === 'load') {
        validating = true;
        checkContextDeclarations();
        for (const element of allElements()) {            // first validations, so AJV compiles here
            for (const k of resolveKind(element.kind).chain) {
                if (k.data.shape) check(k.id, selfOf(element).data, element.id); // includes 'kind' checking itself
            }
            if (instancesOf('slot-fill').includes(element)) { // a fill's value matches its slot's value schema
                const { target, slot: slotName, value } = element.data;
                const slot = resolveKind(getElement(target).kind === 'kind' ? target : getElement(target).kind).slots[slotName];
                if (!slot) throw `${element.id ?? 'a fill'}: ${target} has no slot '${slotName}'`;
                check(`${slot.owner}/slots/${slotName}`, value, element.id ?? `fill of ${target}.${slotName}`);
            }
        }
    }
}

// The whole bootstrap becomes:
//   await loadElements(paths);                    // calls recordAuthors for each element
//   for (const phase of ['load', 'start']) await runLifecycle(phase);
