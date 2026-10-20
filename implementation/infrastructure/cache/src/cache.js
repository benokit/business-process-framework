const stores = new Map();

const storeOf = cache => {
    if (!stores.has(cache)) stores.set(cache, new Map());
    return stores.get(cache);
};

const isLive = entry => entry?.expiresAt > Date.now();

export const cacheGet = ({ input: { cache, key } }) => {
    const entry = storeOf(cache).get(key);
    return isLive(entry) ? { found: true, value: entry.value } : { found: false };
};

export const cacheSet = ({ input: { cache, key, value, ttl } }) => {
    storeOf(cache).set(key, { value, expiresAt: Date.now() + (ttl ?? Infinity) });
    return null;
};

export const cacheEvict = ({ input: { cache, key } }) => {
    storeOf(cache).delete(key);
    return null;
};

export const cacheClear = () => stores.clear();
