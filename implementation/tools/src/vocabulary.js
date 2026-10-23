import path from 'path';
import { extendsKind } from '@business-framework/core/kinds';
import { instancesOf, NODE_KEYS, nodeForms, primitives, sourceOf } from '@business-framework/core/introspection';

const argumentOf = part => {
    const [name, fallback] = part.split('=').map(text => text.trim());
    return fallback === undefined ? name : fallback === 'input' ? `${name}=#` : `${name}?`;
};

const argumentsOf = definition => {
    if (typeof definition !== 'function') return 'special form';
    const named = definition.toString().match(/^\(\{([^}]*)\}\)/);
    return named ? `{ ${named[1].split(',').map(argumentOf).join(', ')} }` : 'expression';
};

const primitivesOf = () => Object.entries(primitives)
    .map(([name, definition]) => ({ name, arguments: argumentsOf(definition) }));

const templatesOf = () => instancesOf('execution-node-template').map(template => ({
    keyword: template.data.keyword,
    id: template.id,
    wrapper: extendsKind(template.kind, 'execution-node-wrapper'),
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
    'node templates (keyword: element, reads #.node):',
    ...templates.map(({ keyword, id, wrapper, source }) => `  ${keyword}: ${id}${wrapper ? ' (wrapper, next)' : ''}  ${source}`.trimEnd()),
    'primitives (=# defaults to the input, ? optional):',
    ...primitives.map(({ name, arguments: args }) => `  ${name} ${args}`),
    'pure functions:',
    ...pureFunctions.map(({ name, input, output }) => `  ${name} ${json(input)} -> ${json(output)}`)
].join('\n');
