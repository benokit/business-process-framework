import { boot, CoreError, execute, getElement, interpret, packageElements } from '@business-framework/core';
import { applyMapping } from '@business-framework/core/mappings';
import { readElements } from '@business-framework/core/loader';
import { mapValues, merge, omit, uniq } from 'lodash-es';
import { matches } from './matching.js';

const fail = message => { throw new Error(message); };

const DEFAULT_EFFECTS = ['trace'];

export const loadScenarios = async paths => {
    const library = await readElements(paths);
    return { library, ids: library.filter(({ kind }) => kind === 'scenario').map(({ id }) => id) };
};

const elementOf = (library, id) => library.find(element => element.id === id) ?? fail(`unknown element '${id}' in the scenario files`);

const answering = stubs => mapValues(stubs, operations => mapValues(operations, ({ answer }) => ({ input }) => applyMapping({ mapping: answer, input })));

const faking = async ({ module, export: name }) => (await import(module))[name]();

const stubsOfSet = async ({ data }) => merge({}, answering(data.stubs ?? {}), ...await Promise.all((data.fakes ?? []).map(faking)));

const recording = (calls, stubs) => mapValues(stubs, (operations, element) => mapValues(operations, (stub, operation) => {
    calls[element] = { ...calls[element], [operation]: [] };
    return args => {
        calls[element][operation].push(args.input);
        return stub(args);
    };
}));

const stubsOf = async (stubSets, calls) => recording(calls, merge({}, ...await Promise.all(stubSets.map(stubsOfSet))));

const inLibrary = (library, ids) => ids.flatMap(id => library.filter(element => element.id === id));

const settingsOf = (library, scenario) => {
    const environment = scenario.data.environment ? elementOf(library, scenario.data.environment).data : {};
    return {
        environment: scenario.data.environment ? [scenario.data.environment] : [],
        packages: uniq([...environment.packages ?? [], ...scenario.data.packages ?? []]),
        stubSets: uniq([...environment.stubSets ?? [], ...scenario.data.stubSets ?? []]),
        given: scenario.data.given ?? [],
        effects: scenario.data.effects ?? environment.effects ?? DEFAULT_EFFECTS
    };
};

const environmentKey = ({ packages, effects }) => JSON.stringify([[...packages].sort(), [...effects].sort()]);

export const groupScenarios = (library, ids) => Object.values(Object.groupBy(ids, id => environmentKey(settingsOf(library, elementOf(library, id)))));

export const bootGroup = async (library, ids) => {
    const settings = ids.map(id => settingsOf(library, elementOf(library, id)));
    const packages = uniq(settings.flatMap(setting => setting.packages));
    const shared = uniq(settings.flatMap(({ environment, stubSets, given }) => [...environment, ...stubSets, ...given]));
    await boot({
        paths: [packageElements('@business-framework/scenarios'), ...packages.map(name => packageElements(`@business-framework/${name}`))],
        elements: [...ids.map(id => elementOf(library, id)), ...inLibrary(library, shared)]
    });
};

const SCOPE_KEYS = ['input', 'self', '_ctx'];

const scopeAfter = (scenario, calls) => execute({ method: [...[scenario.data.act].flat(), { set: '#' }], input: null, self: scenario, _ctx: {} })
    .then(scope => ({ ...omit(scope, SCOPE_KEYS), calls }));

const failureOf = (scope, { actual, expected }, index) => {
    const values = { actual: applyMapping({ mapping: actual, input: scope }), expected: applyMapping({ mapping: expected, input: scope }) };
    return matches(values) ? [] : [{ index, ...values }];
};

const check = (scenario, scope) => {
    const [failure] = scenario.data.assert.flatMap((assertion, index) => failureOf(scope, assertion, index));
    if (failure) throw new CoreError('assertion-failed', `assertion ${failure.index + 1} of ${scenario.id} doesn't hold`, failure);
};

export const runScenario = async (library, id) => {
    const calls = {};
    const { stubSets, effects } = settingsOf(library, elementOf(library, id));
    const scenario = getElement(id);
    interpret({ stubs: await stubsOf(stubSets.map(getElement), calls), effects });
    try {
        check(scenario, await scopeAfter(scenario, calls));
    } finally {
        interpret();
    }
};
