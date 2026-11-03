import { getElement } from '@business-framework/core';
import { applyMapping } from '@business-framework/core/mappings';
import { traitsOf } from './traits.js';

const viewedValue = ({ record, key, use, at }) => {
    const { view } = getElement(use.trait).data;
    return view === undefined
        ? record.data[key]
        : applyMapping({ mapping: view, input: { entityType: record.entityType, key, configuration: use.configuration, value: record.data[key], at } });
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
