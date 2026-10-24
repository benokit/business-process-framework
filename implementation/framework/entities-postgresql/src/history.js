import jsonPatch from 'fast-json-patch';

export const entityRevision = ({ before, trait, value }) => {
    const data = { ...before.data, [trait]: value };
    return { data: JSON.stringify(data), patch: JSON.stringify(jsonPatch.compare(data, before.data)) };
};

export const entityRewind = ({ record, patches, revision }) => patches.reduce((rewound, patch) => ({
    ...rewound,
    data: jsonPatch.applyPatch(rewound.data, patch.data_patch, false, false).newDocument,
    timestampUtc: patch.timestamp_utc
}), { ...record, revision });
