import { isEqual, isPlainObject } from 'lodash-es';

const matchesEntries = (actual, expected) => actual !== null && typeof actual === 'object'
    && Object.entries(expected).every(([key, value]) => matches({ actual: actual[key], expected: value }));

const matchesItems = (actual, expected) => Array.isArray(actual)
    && actual.length === expected.length
    && expected.every((value, index) => matches({ actual: actual[index], expected: value }));

export const matches = ({ actual, expected }) => {
    if (isPlainObject(expected)) return matchesEntries(actual, expected);
    if (Array.isArray(expected)) return matchesItems(actual, expected);
    return isEqual(actual, expected);
};
