const stores = new Map();

const storeOf = cache => {
    if (!stores.has(cache)) stores.set(cache, new Map());
    return stores.get(cache);
};

const isLive = entry => entry?.expiresAt > Date.now();

const putLast = (store, key, entry) => {
    store.delete(key);
    store.set(key, entry);
};

export const cacheGet = ({ input: { cache, key } }) => {
    const store = storeOf(cache);
    const entry = store.get(key);
    if (!isLive(entry)) {
        store.delete(key);
        return { found: false };
    }
    putLast(store, key, entry);
    return { found: true, value: entry.value };
};

export const cacheSet = ({ input: { cache, key, value, ttl, maxEntries } }) => {
    const store = storeOf(cache);
    putLast(store, key, { value, expiresAt: Date.now() + (ttl ?? Infinity) });
    if (store.size > maxEntries) store.delete(store.keys().next().value);
    return null;
};

export const cacheEvict = ({ input: { cache, key } }) => {
    storeOf(cache).delete(key);
    return null;
};

export const cacheClear = () => stores.clear();
