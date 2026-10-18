import { lazy } from '../registry.js';
import { extendsKind, instancesOf } from '../kinds.js';
import { fail } from '../errors.js';
import { runMethod } from './pipeline.js';
import { NEXT } from './nodes/middleware.js';

const templates = lazy(() => instancesOf('execution-node-template').reduce((index, template) => {
    const { keyword } = template.data;
    if (index.has(keyword)) fail('duplicate-keyword', `node keyword '${keyword}' is defined twice`, { keyword });
    return index.set(keyword, template);
}, new Map()));

export const findTemplate = keyword => templates().get(keyword);

const templateScope = (node, scope) => ({ input: scope.input, self: scope.self, _ctx: scope._ctx, node });

const runWrapper = (template, node, scope) => runMethod(template.data.implementation, {
    ...templateScope(node, scope),
    [NEXT]: (_, _ctx) => runMethod(node[template.data.keyword], { ...scope, _ctx })
});

const runPlain = (template, node, scope) => runMethod(template.data.implementation, templateScope(node, scope));

export const runTemplate = (template, node, scope) => extendsKind(template.kind, 'execution-node-wrapper')
    ? runWrapper(template, node, scope)
    : runPlain(template, node, scope);
