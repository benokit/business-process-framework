import path from 'path';
import { extendsKind } from '@business-framework/core/kinds';
import { instancesOf, NODE_KEYS, nodeForms, primitives, sourceOf } from '@business-framework/core/introspection';

const argumentsOf = definition => {
    if (typeof definition === 'function') return 'expression';
    if (definition.params) return `{ ${definition.params.join(', ')} }`;
    return definition.description?.replace(/^\$\w+: /, '') ?? 'special form';
};

const primitivesOf = () => Object.entries(primitives)
    .map(([name, definition]) => ({ name, arguments: argumentsOf(definition) }));

const templatesOf = () => instancesOf('execution-node-template').map(template => ({
    keyword: template.data.keyword,
    id: template.id,
    wrapper: extendsKind(template.kind, 'execution-node-wrapper'),
    node: template.data.node,
    source: path.relative(process.cwd(), sourceOf(template) ?? '')
}));

const pureFunctionsOf = () => instancesOf('pure-function').map(({ id, data: { signature } }) =>
    ({ name: `$func/${id}`, input: signature?.input, output: signature?.output }));

export const vocabulary = () => ({
    nodeKeys: NODE_KEYS,
    nodeForms: Object.entries(nodeForms).map(([keyword, companions]) => ({ keyword, companions })),
    templates: templatesOf(),
    primitives: primitivesOf(),
    pureFunctions: pureFunctionsOf()
});

const json = value => JSON.stringify(value);

export const renderVocabulary = ({ nodeKeys, nodeForms, templates, primitives, pureFunctions }) => [
    `nodes: one keyword plus ${nodeKeys.join(', ')}`,
    ...nodeForms.map(({ keyword, companions }) => `  ${[keyword, ...companions].join(' ')}`),
    'node templates (keyword: node shape, element):',
    ...templates.map(({ keyword, id, wrapper, node, source }) =>
        `  ${keyword}: ${node ? json(node) : '?'}  ${id}${wrapper ? ' (wrapper, next)' : ''}  ${source}`.trimEnd()),
    'primitives (=# defaults to the input, ? optional):',
    ...primitives.map(({ name, arguments: args }) => `  ${name} ${args}`),
    'pure functions:',
    ...pureFunctions.map(({ name, input, output }) => `  ${name} ${json(input)} -> ${json(output)}`)
].join('\n');
