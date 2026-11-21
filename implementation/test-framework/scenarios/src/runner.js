import { boot, CoreError, execute, getElement, interpret, packageElements } from '@business-framework/core';
import { applyMapping } from '@business-framework/core/mappings';
import { readElements } from '@business-framework/core/loader';
import { isEqual, mapValues, merge, omit, uniq } from 'lodash-es';
import { matches } from './matching.js';

const fail = message => { throw new Error(message); };

const DEFAULT_EFFECTS = ['trace'];
const TEST_KINDS = ['scenario', 'mapping-test'];

export const loadScenarios = async paths => {
    const library = await readElements(paths);
    return { library, ids: library.filter(({ kind }) => TEST_KINDS.includes(kind)).map(({ id }) => id) };
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

const writtenData = element => element.data ?? element['/data'] ?? {};

const settingsOf = (library, test) => {
    const written = writtenData(test);
    const environment = written.environment ? writtenData(elementOf(library, written.environment)) : {};
    return {
        environment: written.environment ? [written.environment] : [],
        packages: uniq([...environment.packages ?? [], ...written.packages ?? []]),
        stubSets: uniq([...environment.stubSets ?? [], ...written.stubSets ?? []]),
        given: written.given ?? [],
        effects: written.effects ?? environment.effects ?? DEFAULT_EFFECTS
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

const outcomeOf = (subject, input, apply) => {
    try {
        return { value: apply(subject, input) };
    } catch (error) {
        return { error };
    }
};

const runCase = ({ id, subject, base, apply }, testCase, index) => {
    const input = { ...base, ...apply(testCase.input, base) };
    const actual = outcomeOf(subject, input, apply);
    const expected = testCase.throws === undefined ? { value: apply(testCase.expected, input) } : { error: { code: testCase.throws } };
    const shown = outcome => outcome.error ? { error: outcome.error.code } : outcome.value;
    if (actual.error && !expected.error) throw actual.error;
    if (!(expected.error ? actual.error?.code === expected.error.code : isEqual(actual.value, expected.value))) {
        throw new CoreError('assertion-failed', `case ${testCase.name ?? index + 1} of ${id} gives another result`, { actual: shown(actual), expected: shown(expected) });
    }
};

const runMappingTest = id => {
    const element = getElement(id);
    const apply = (mapping, input) => mapping === undefined ? undefined : applyMapping({ mapping, input });
    const test = { id, subject: element.data.subject, base: apply(element.data.base, null), apply };
    element.data.cases.forEach((testCase, index) => runCase(test, testCase, index));
};

export const runTest = (library, id) => elementOf(library, id).kind === 'scenario' ? runScenario(library, id) : runMappingTest(id);
