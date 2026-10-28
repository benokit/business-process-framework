import { invoke, traced } from '@business-framework/core';
import { installedPackages, startServer } from '@business-framework/server';

const PORT_OF_ITS_OWN = { kind: 'app-config', data: { 'http-server': { port: 0 } } };
const CHANGING = ['write', 'irreversible'];

export const traceApplication = async ({ element, operation, input = null, paths = [], live = false }) => {
    const stop = await startServer({ packages: await installedPackages(), paths, elements: [PORT_OF_ITS_OWN] });
    try {
        return await traced(() => invoke(element, operation, input), { skip: live ? [] : CHANGING });
    } finally {
        await stop();
    }
};

const isStep = ({ label }) => /^step \d+ /.test(label);

const originOf = span => span.error && span.children.every(child => !child.error);

const shown = (spans, steps) => spans.flatMap(span => isStep(span) && !steps && !originOf(span)
    ? shown(span.children, steps)
    : [{ ...span, children: shown(span.children, steps) }]);

const notes = ({ effects, skipped, error, ms }) => [
    effects && `[${effects.join(', ')}]`,
    skipped && 'skipped (dry run)',
    error && `failed: ${error}`,
    ms !== undefined && `${ms.toFixed(1)} ms`
].filter(Boolean).join('  ');

const lines = (spans, depth = 0) => spans.flatMap(span => [
    `${'  '.repeat(depth)}${span.label}${notes(span) && `  ${notes(span)}`}`,
    ...lines(span.children, depth + 1)
]);

export const renderTrace = ({ result, error, spans }, { steps = false } = {}) => [
    ...lines(shown(spans, steps)),
    error ? `=> ${error.code}: ${error.message}` : `=> ${JSON.stringify(result)}`
].join('\n');
