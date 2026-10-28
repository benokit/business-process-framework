import { expect } from 'chai';
import { invoke, start, validate } from '../src/index.js';
import { availableSettings } from '../src/settings.js';
import { bootWith, element, kind, operation } from './helpers.js';

const RETRY = {
    '$data#1': [
        { '!mode=': 'none' },
        { '!mode=': 'fixed', '!max': 'integer', '!delayMs': 'integer' }
    ]
};

const integration = settings => kind('integration', {
    settings,
    operations: { read: operation({ set: { '$func/settings': '#.self.id' } }) }
});

const appConfig = data => ({ kind: 'app-config', data });

const withEnvironment = async (variables, run) => {
    Object.assign(process.env, variables);
    try {
        return await run();
    } finally {
        Object.keys(variables).forEach(name => delete process.env[name]);
    }
};

const errorOf = promise => promise.then(() => null, error => error);

describe('settings', () => {
    it('composes the defaults of the chain by plain override', async () => {
        await bootWith(
            integration({ shape: { retry: { max: 'integer', delayMs: 'integer' }, 'errors[]': 'string' }, defaults: { retry: { max: 3, delayMs: 100 }, errors: ['a'] } }),
            kind('search-integration', { extends: 'integration', settings: { defaults: { retry: { delayMs: 250 }, errors: ['b', 'c'] } } }),
            element('product-search', 'search-integration'));
        expect(await invoke('product-search', 'read', null)).to.deep.equal({ retry: { max: 3, delayMs: 250 }, errors: ['b', 'c'] });
    });

    it('ranks app-config above the defaults and the environment above both, whatever the specificity', async () => {
        await bootWith(
            integration({ shape: { retry: { max: 'integer', delayMs: 'integer' } }, defaults: { retry: { max: 3, delayMs: 100 } } }),
            kind('search-integration', { extends: 'integration', settings: { defaults: { retry: { delayMs: 250 } } } }),
            element('product-search', 'search-integration'),
            appConfig({ 'product-search': { retry: { max: 5 } } }));
        await withEnvironment({ BPF__integration__retry__delayMs: '50' }, async () => {
            expect(await invoke('product-search', 'read', null)).to.deep.equal({ retry: { max: 5, delayMs: 50 } });
        });
    });

    it('names the variable of a kind with hyphens by underscores and converts values by the shape', async () => {
        await bootWith(
            kind('search-integration', {
                settings: { shape: { timeoutMs: 'integer', secure: 'boolean', ratio: 'number', 'errors[]': 'string' }, defaults: { timeoutMs: 1, secure: false, ratio: 1, errors: ['a'] } },
                operations: { read: operation({ set: { '$func/settings': '#.self.id' } }) }
            }),
            element('product-search', 'search-integration'));
        await withEnvironment({ BPF__search_integration__timeoutMs: '5000', BPF__product_search__secure: 'true', BPF__product_search__ratio: '0.5', BPF__product_search__errors: 'x, y' }, async () => {
            expect(await invoke('product-search', 'read', null)).to.deep.equal({ timeoutMs: 5000, secure: true, ratio: 0.5, errors: ['x', 'y'] });
        });
    });

    it('selects the parameters by the mode and ignores those it doesn\'t read', async () => {
        await bootWith(
            integration({ shape: { retry: RETRY }, defaults: { retry: { mode: 'fixed', max: 3, delayMs: 100, factor: 2 } } }),
            element('one', 'integration'));
        await withEnvironment({ BPF__one__retry__mode: 'none' }, async () => {
            await start();
            expect((await invoke('one', 'read', null)).retry.mode).to.equal('none');
        });
    });

    it('fails the start on a value that doesn\'t fit, naming the layers searched', async () => {
        await bootWith(integration({ shape: { timeoutMs: 'integer' }, defaults: { timeoutMs: 1 } }), element('one', 'integration'));
        await withEnvironment({ BPF__one__timeoutMs: 'soon' }, async () => {
            const error = await errorOf(start());
            expect(error.code).to.equal('invalid-settings');
            expect(error.data.layers).to.deep.equal(['integration', 'one']);
        });
    });

    it('fails the start when a required setting has no layer', async () => {
        await bootWith(integration({ shape: { '!url': 'string' } }), element('one', 'integration'));
        expect((await errorOf(start())).code).to.equal('invalid-settings');
        await withEnvironment({ BPF__one__url: 'http://x' }, async () => {
            await start();
            expect(await invoke('one', 'read', null)).to.deep.equal({ url: 'http://x' });
        });
    });

    it('reports a settings shape that can\'t be set by environment variables', async () => {
        await bootWith(integration({ shape: { 'retry-policy': 'integer', 'rules[]': { '!a': 'string' }, nested: { schema: '@schema' } } }));
        const [problem] = validate();
        expect(problem.code).to.equal('settings-shape');
        expect(problem.data.problems).to.have.length(3);
    });

    it('lists the settings that are available, with type, mode values, default and variable, without reading the environment', async () => {
        await bootWith(
            integration({ shape: { retry: RETRY, 'errors[]': 'string', 'limits{}': 'integer' }, defaults: { retry: { mode: 'fixed', max: 3 }, errors: ['a'] } }),
            element('product-search', 'integration'));
        await withEnvironment({ BPF__product_search__retry__max: '9' }, async () => {
            expect(availableSettings('product-search')).to.deep.equal([
                { path: 'errors', type: 'string[]', default: ['a'], variable: 'BPF__product_search__errors' },
                { path: 'limits.*', type: 'integer', variable: 'BPF__product_search__limits__<key>' },
                { path: 'retry.delayMs', type: 'integer', variable: 'BPF__product_search__retry__delayMs' },
                { path: 'retry.max', type: 'integer', default: 3, variable: 'BPF__product_search__retry__max' },
                { path: 'retry.mode', type: 'string', values: ['none', 'fixed'], default: 'fixed', variable: 'BPF__product_search__retry__mode' }
            ]);
        });
    });

    it('warns about sections and variables that match nothing, and about settings an element doesn\'t have', async () => {
        await bootWith(
            integration({ shape: { timeoutMs: 'integer', 'limits{}': 'integer' }, defaults: { timeoutMs: 1 } }),
            element('one', 'integration'),
            appConfig({ 'on': { timeoutMs: 2 }, one: { timeoutMs: 3, limits: { a: 1 }, timeout: 4 } }));
        await withEnvironment({ BPF__oen__timeoutMs: '5', BPF__one__timeoutMS: '6' }, async () => {
            const warnings = validate({ warnings: true }).filter(problem => problem.data.severity === 'warning');
            expect(warnings.map(problem => problem.code).sort()).to.deep.equal(
                ['unknown-setting', 'unknown-setting', 'unknown-settings-section', 'unknown-settings-variable']);
            await start();
        });
    });
});
