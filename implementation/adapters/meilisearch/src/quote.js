export const meilisearchString = value => `"${value.replace(/["\\]/g, '\\$&')}"`;
