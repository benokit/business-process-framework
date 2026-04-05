const store = new Map();

export function cacheGet({ input: { key } }) {
    if (!store.has(key)) return { found: false };
    return { found: true, value: store.get(key) };
}

export function cacheSet({ input: { key, value } }) {
    store.set(key, value);
}

export function cacheClear() {
    store.clear();
}
