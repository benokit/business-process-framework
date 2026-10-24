import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { isPlainObject, omit } from 'lodash-es';
import { findElement, kindOf } from './registry.js';
import { extendsKind, resolveKind } from './kinds.js';
import { positionsIn, propertiesOf, validateValue } from './schemas.js';
import { managedBy } from './context.js';
import { findTemplate } from './execution/templates.js';
import { NODE_KEYS, nodeForms, PIPELINE_KEYS } from './execution/nodes/forms.js';
import { isKindReference } from './references.js';
import { primitives } from './primitives.js';
import { fail } from './errors.js';

export const targetKind = target => {
    const element = findElement(target);
    return element && resolveKind(element.kind === 'kind' ? element.id : kindOf(element));
};

const fillPositions = ({ data: { target, slot, value } }) => {
    const declaration = findElement(target) && targetKind(target).slots[slot];
    return declaration ? positionsIn({ schemaId: `${declaration.owner}/slots/${slot}`, value, path: 'value' }) : [];
};

const positionsOf = element => [
    ...resolveKind(kindOf(element)).chain
        .filter(kind => kind.data.shape !== undefined)
        .flatMap(kind => positionsIn({ schemaId: kind.id, value: element.data })),
    ...element.kind === 'slot-fill' ? fillPositions(element) : []
];

export const codeOf = element => positionsOf(element).filter(({ type }) => type !== 'ref');

const problem = (at, path, code, message, data = {}) => () =>
    fail(code, `${at.author.id ?? `a ${at.author.kind}`} ${path}: ${message}`, { element: at.author.id, path, ...data });

const isNative = key => Object.hasOwn(nodeForms, key);

const isLiteral = value => typeof value === 'string' && !value.startsWith('#') && !value.startsWith('@');

const literalOf = value => value.startsWith('\\') ? value.slice(1) : value;

const isWrapper = template => extendsKind(template.kind, 'execution-node-wrapper');

const kindOfTarget = target => {
    if (isKindReference(target)) return findElement(target.instanceOf) && resolveKind(target.instanceOf);
    if (!isLiteral(target)) return undefined;
    const element = findElement(literalOf(target));
    return element && resolveKind(kindOf(element));
};

const selfKindOf = author => {
    if (author.kind === 'kind') return resolveKind(author.id);
    if (author.kind === 'slot-fill') return targetKind(author.data.target);
    return resolveKind(kindOf(author));
};

const invokeProblems = (node, at, path) => {
    if (isLiteral(node.invoke) && !findElement(literalOf(node.invoke))) {
        return [problem(at, path, 'unknown-element', `invokes unknown element '${literalOf(node.invoke)}'`)];
    }
    const kind = kindOfTarget(node.invoke);
    const operation = isLiteral(node.operation) ? literalOf(node.operation) : undefined;
    return kind && operation !== undefined && !kind.operations[operation]
        ? [problem(at, path, 'unknown-operation', `${kind.id} has no operation '${operation}'`)]
        : [];
};

const moduleExists = specifier => {
    try {
        const url = import.meta.resolve(specifier);
        return !url.startsWith('file:') || existsSync(fileURLToPath(url));
    } catch {
        return false;
    }
};

const lowProblems = (node, at, path) => typeof node.low?.module === 'string' && !moduleExists(node.low.module)
    ? [problem(at, path, 'unknown-module', `low module '${node.low.module}' doesn't resolve`)]
    : [];

const bindingProblems = (node, at, path) => {
    if (!isPlainObject(node.withContext) || Object.keys(node.withContext).some(key => key.startsWith('$'))) return [];
    const manages = managedBy(at.author);
    return Object.keys(node.withContext).filter(key => !manages[key]).map(key =>
        problem(at, path, 'context-right', `may not bind context '${key}': ${at.author.id ?? 'it'} doesn't manage it`, { key }));
};

const NODE_CHECKS = { invoke: invokeProblems, low: lowProblems, withContext: bindingProblems };

const isReferenced = (code, element, kind, extending) => {
    if (kind === undefined) return true;
    if (isKindReference(code)) return element.kind === 'kind' && extendsKind(element.id, kind);
    return extendsKind(kindOf(element), kind) && (extending === undefined || extendsKind(element.id, extending));
};

const referenceProblems = ({ kind, extending, code, path }, at) => {
    const named = isKindReference(code) ? code.instanceOf : code;
    const element = typeof named === 'string' ? findElement(named) : undefined;
    if (element === undefined) return [problem(at, path, 'unknown-element', `refers to unknown element '${named}'`)];
    return isReferenced(code, element, kind, extending) ? [] : [problem(at, path, 'invalid-reference', `'${named}' is not a ${extending ?? kind}`)];
};

const errorsOf = errors => errors.map(error => `${error.instancePath || '/'} ${error.message}`).join('; ');

const templatePositions = (node, template, path) => positionsIn({ schemaId: `${template.id}/node`, value: node, path });

const templateProblems = (node, template, at, path) => {
    const schemaId = `${template.id}/node`;
    const { isValid, errors } = validateValue({ schemaId, value: omit(node, NODE_KEYS) });
    const known = propertiesOf(schemaId);
    return [
        ...isValid ? [] : [problem(at, path, 'invalid-node', `not a '${template.data.keyword}' node: ${errorsOf(errors)}`)],
        ...Object.keys(omit(node, NODE_KEYS)).filter(key => !known.includes(key))
            .map(key => problem(at, path, 'unknown-node-key', `'${key}' is not a key of '${template.data.keyword}' nodes`)),
        ...templatePositions(node, template, path).filter(({ type }) => type === 'ref').flatMap(position => referenceProblems(position, at))
    ];
};

const pipelinesOf = (node, keyword, template) => {
    if (template) return isWrapper(template) && !template.data.node ? [[keyword, node[keyword]]] : [];
    if (keyword === 'switch') return Object.entries(node.switch?.cases ?? {}).map(([name, pipeline]) => [`switch.cases.${name}`, pipeline]);
    return [keyword, ...nodeForms[keyword] ?? []].filter(key => PIPELINE_KEYS.includes(key) && key in node).map(key => [key, node[key]]);
};

const childrenOf = ({ node, path, keyword, template }) => template?.data.node
    ? templatePositions(node, template, path).filter(({ type }) => type === 'method').map(position => [position.path, position.code])
    : pipelinesOf(node, keyword, template).map(([key, pipeline]) => [`${path}.${key}`, pipeline]);

const nodeAt = (node, path) => {
    if (!isPlainObject(node)) return [{ node, path, keywords: [] }];
    const keywords = Object.keys(node).filter(key => !NODE_KEYS.includes(key) && (isNative(key) || findTemplate(key)));
    const [keyword] = keywords;
    const template = keyword === undefined || isNative(keyword) ? undefined : findTemplate(keyword);
    const entry = { node, path, keywords, keyword, template };
    return keywords.length > 1 ? [entry] : [entry, ...childrenOf(entry).flatMap(([at, pipeline]) => nodesIn(pipeline, at))];
};

const nodesIn = (pipeline, path) => Array.isArray(pipeline)
    ? pipeline.flatMap((node, index) => nodeAt(node, `${path}[${index}]`))
    : nodeAt(pipeline, path);

const structureProblems = (node, keys, keyword, at, path) => [
    ...keyword === undefined && keys.length > 0 ? [problem(at, path, 'unknown-keyword', `no node keyword among '${keys.join("', '")}'`)] : [],
    ...isNative(keyword) ? keys.filter(key => key !== keyword && !nodeForms[keyword].includes(key))
        .map(key => problem(at, path, 'unknown-node-key', `'${key}' is not a key of '${keyword}' nodes`)) : [],
    ...node.outputKey === '_ctx' ? [problem(at, path, 'context-write', "outputKey '_ctx' is not allowed: bind context with withContext")] : [],
    ...keyword === 'next' && !at.allowsNext ? [problem(at, path, 'next-outside-middleware', "'next' where no middleware runs")] : []
];

const nodeProblems = at => ({ node, path, keywords, keyword, template }) => {
    if (!isPlainObject(node)) return [problem(at, path, 'invalid-node', 'a node is an object')];
    if (keywords.length > 1) return [problem(at, path, 'ambiguous-node', `several node keywords: '${keywords.join("', '")}'`)];
    return [
        ...structureProblems(node, Object.keys(node).filter(key => !NODE_KEYS.includes(key)), keyword, at, path),
        ...NODE_CHECKS[keyword]?.(node, at, path) ?? [],
        ...template?.data.node ? templateProblems(node, template, at, path) : []
    ];
};

const declaredFunctions = tree => {
    if (Array.isArray(tree)) return tree.flatMap(declaredFunctions);
    if (!isPlainObject(tree) || '$literal' in tree) return [];
    return [
        ...Object.keys(tree.$let ?? {}).filter(key => key.startsWith('$')),
        ...Object.values(tree).flatMap(declaredFunctions)
    ];
};

const slotValuesProblems = (argument, at, path) => {
    if (!isPlainObject(argument) || !isLiteral(argument.slot)) return [];
    const kind = argument.element === '#.self.id' ? selfKindOf(at.author) : kindOfTarget(argument.element);
    const slot = literalOf(argument.slot);
    return kind && !kind.slots[slot] ? [problem(at, path, 'unknown-slot', `${kind.id} has no slot '${slot}'`)] : [];
};

const functionProblems = (key, value, at, path, declared) => {
    if (key === '$func/slot-values') return slotValuesProblems(value, at, path);
    if (key.startsWith('$func/')) {
        return findElement(key.slice(6))?.kind === 'pure-function' ? [] : [problem(at, path, 'unknown-function', `unknown pure function '${key}'`)];
    }
    return Object.hasOwn(primitives, key) || declared.includes(key) ? [] : [problem(at, path, 'unknown-function', `unknown primitive '${key}'`)];
};

const isCall = tree => {
    const keys = Object.keys(tree);
    return keys.length > 0 && keys.length <= 2 && keys.every(key => key.startsWith('$'));
};

const callsIn = (tree, path) => {
    if (Array.isArray(tree)) return tree.flatMap((item, index) => callsIn(item, `${path}[${index}]`));
    if (!isPlainObject(tree) || '$literal' in tree) return [];
    return Object.entries(tree).flatMap(([key, value]) => [
        ...isCall(tree) ? [{ key, value, path }] : [],
        ...callsIn(value, `${path}.${key}`)
    ]);
};

const FORBIDS_NEXT = /^(operations\.[^.]+\.implementation|lifecycle\.(load|start|stop))$/;

const allowsNext = (author, path) => author.kind === 'kind'
    ? !FORBIDS_NEXT.test(path)
    : !(extendsKind(kindOf(author), 'execution-node-template') && !isWrapper(author) && path === 'implementation');

const positionProblems = author => position => {
    const { type, code, path } = position;
    const at = { author, allowsNext: allowsNext(author, path) };
    if (type === 'ref') return referenceProblems(position, at);
    const declared = declaredFunctions(code);
    return [
        ...type === 'method' ? nodesIn(code, path).flatMap(nodeProblems(at)) : [],
        ...callsIn(code, path).flatMap(call => functionProblems(call.key, call.value, at, call.path, declared))
    ];
};

export const codeProblems = author => positionsOf(author).flatMap(positionProblems(author));

const nameOf = code => isKindReference(code) ? code.instanceOf : isLiteral(code) ? literalOf(code) : undefined;

const nodeReferences = ({ node, path, keyword, template }) => [
    ...template ? [{ to: template.id, path, via: 'template' }] : [],
    ...keyword === 'invoke' ? [{ to: nameOf(node.invoke), path: `${path}.invoke`, via: 'invoke' }] : [],
    ...template?.data.node ? templatePositions(node, template, path).filter(({ type }) => type === 'ref')
        .map(position => ({ to: nameOf(position.code), path: position.path, via: 'ref' })) : []
];

const callReferences = ({ key, value, path }) => [
    ...key.startsWith('$func/') ? [{ to: key.slice(6), path, via: 'function' }] : [],
    ...key === '$func/slot-values' && isPlainObject(value) ? [{ to: nameOf(value.element), path: `${path}.element`, via: 'slot' }] : []
];

const positionReferences = ({ type, code, path }) => type === 'ref'
    ? [{ to: nameOf(code), path, via: 'ref' }]
    : [...type === 'method' ? nodesIn(code, path).flatMap(nodeReferences) : [], ...callsIn(code, path).flatMap(callReferences)];

export const referencesOf = element => [
    { to: kindOf(element), path: 'kind', via: 'kind' },
    ...positionsOf(element).flatMap(positionReferences)
].filter(({ to }) => to !== undefined);
