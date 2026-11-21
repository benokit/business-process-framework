import { AssertionError } from 'chai';
import { bootGroup, groupScenarios, loadScenarios, runTest } from './runner.js';

const asAssertion = error => error.code === 'assertion-failed'
    ? Object.assign(new AssertionError(error.message, { actual: error.data.actual, expected: error.data.expected, showDiff: true }), { stack: error.stack })
    : error;

export const describeScenarios = async (title, paths) => {
    const { describe, it, before } = globalThis;
    const { library, ids } = await loadScenarios(paths);
    describe(title, () => {
        groupScenarios(library, ids).forEach((group, index) => describe(`environment ${index + 1}`, () => {
            before(() => bootGroup(library, group));
            group.forEach(id => it(id, () => Promise.resolve().then(() => runTest(library, id)).catch(error => { throw asAssertion(error); })));
        }));
    });
};
