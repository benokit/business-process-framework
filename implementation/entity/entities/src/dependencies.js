const DATA_KEY = /^#\.data\.([a-z0-9]+(-[a-z0-9]+)*)/;

const leaves = value => typeof value === 'string' ? [value] : value !== null && typeof value === 'object' ? Object.values(value).flatMap(leaves) : [];

export const recordKeysRead = mappings => [...new Set(leaves(mappings).map(leaf => DATA_KEY.exec(leaf)?.[1]).filter(key => key !== undefined))].sort();

export const unlistedReadProblems = ({ entityType, key, dependsOn, rule, mappings }) => dependsOn.length === 0
    ? []
    : recordKeysRead(mappings)
        .filter(read => !dependsOn.includes(read))
        .map(read => `${entityType}: the ${rule} of '${key}' reads '${read}', which dependsOn doesn't list`);
