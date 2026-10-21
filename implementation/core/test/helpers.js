import { boot } from '../src/index.js';
import { calls } from './fixtures/effects.js';

export const EFFECTS = new URL('./fixtures/effects.js', import.meta.url).href;

export const low = name => ({ low: { module: EFFECTS, export: name } });

export const bootWith = async (...elements) => {
    calls.length = 0;
    await boot({ elements: elements.flat() });
};

export const kind = (id, data) => ({ id, kind: 'kind', data });

export const element = (id, kindId, data = {}) => ({ id, kind: kindId, data });

export const operation = (implementation, input = '@any', output) => ({ input, implementation, ...(output && { output }) });

export const runner = implementation => [
    kind('runner', { operations: { run: operation(implementation) } }),
    element('the-runner', 'runner')
];
