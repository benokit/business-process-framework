import { getElement } from '@business-framework/core';
import { applyMapping } from '@business-framework/core/mappings';
import { traitsOf } from './traits.js';

const viewedValue = ({ record, key, use, at }) => {
    const { view } = getElement(use.trait).data;
    const value = nestedViewedValue({ value: record.data[key], use, record, at });
    return view === undefined
        ? value
        : applyMapping({ mapping: view, input: { entityType: record.entityType, key, configuration: use.configuration, value, at } });
};

const nestedViewedValue = ({ value, use, record, at }) => {
    const children = traitsOf(use.trait);
    return Object.keys(children).length === 0 || value === null || typeof value !== 'object'
        ? value
        : Object.fromEntries(Object.entries(value).map(([key, inner]) => [
            key,
            children[key] === undefined ? inner : viewedValue({ record: { entityType: record.entityType, data: value }, key, use: children[key], at })
        ]));
};

export const viewedRecord = ({ record, entityType, at }) => {
    const uses = traitsOf(record.entityType ?? entityType);
    return {
        ...record,
        data: Object.fromEntries(Object.entries(record.data).map(([key, value]) => [
            key,
            uses[key] === undefined ? value : viewedValue({ record: { ...record, entityType: record.entityType ?? entityType }, key, use: uses[key], at })
        ]))
    };
};

export const viewedChange = ({ change, entityType }) => Object.fromEntries(Object.entries(change)
    .map(([key, value]) => [key, ['before', 'after'].includes(key) && value?.data !== undefined ? viewedRecord({ record: value, entityType }) : value]));
