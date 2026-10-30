import jsonPatch from 'fast-json-patch';

export const compare = (from, to) => jsonPatch.compare(from, to);

export const applyAll = (document, patches) => patches
    .reduce((current, patch) => jsonPatch.applyPatch(current, patch, false, true).newDocument, structuredClone(document));
