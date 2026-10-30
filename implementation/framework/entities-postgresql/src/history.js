import { applyAll, compare } from '@business-framework/entities/patch';

export const entityRevision = ({ before, key, value, derived }) => {
    const data = { ...before.data, [key]: value, ...derived };
    return { data: JSON.stringify(data), patch: JSON.stringify(compare(data, before.data)) };
};

export const entityRewind = ({ record, patches, revision }) => ({
    ...record,
    revision,
    data: applyAll(record.data, patches.map(patch => patch.data_patch)),
    timestampUtc: patches.at(-1)?.timestamp_utc ?? record.timestampUtc
});
