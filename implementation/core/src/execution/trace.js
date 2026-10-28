import { AsyncLocalStorage } from 'async_hooks';
import { framing, labelOf } from '../errors.js';
import { observing } from './interpreter.js';

const current = new AsyncLocalStorage();

const settle = (span, started, error) => {
    span.ms = performance.now() - started;
    if (error instanceof Error) span.error = error.code ?? 'error';
};

const isNoise = ({ label, error, children }) => label.endsWith(' inputMap') && !error && children.length === 0;

const around = original => (run, ...label) => {
    const parent = current.getStore();
    if (parent === undefined) return original(run, ...label);
    const span = { label: labelOf(label), children: [] };
    parent.children.push(span);
    const started = performance.now();
    const done = error => {
        settle(span, started, error);
        if (isNoise(span)) parent.children.splice(parent.children.indexOf(span), 1);
    };
    try {
        const result = current.run(span, () => original(run, ...label));
        return result instanceof Promise
            ? result.then(value => (done(), value), error => { done(error); throw error; })
            : (done(), result);
    } catch (error) {
        done(error);
        throw error;
    }
};

const recordLow = ({ name, effects, skipped }) => current.getStore()?.children.push({
    label: `low ${name}`,
    effects,
    ...(skipped && { skipped }),
    children: []
});

const outcomeOf = async run => {
    try {
        return { result: await run() };
    } catch (error) {
        return { error: { code: error.code ?? 'error', message: error.message } };
    }
};

export const traced = async (run, { skip = [] } = {}) => {
    const root = { label: 'trace', children: [] };
    const original = framing.around;
    framing.around = around(original);
    const restore = observing({ skip, observe: recordLow });
    try {
        return { ...await current.run(root, () => outcomeOf(run)), spans: root.children };
    } finally {
        restore();
        framing.around = original;
    }
};
