const stores = new Map();

const storeOf = cache => {
    if (!stores.has(cache)) stores.set(cache, new Map());
    return stores.get(cache);
};

export const cacheGet = ({ input: { cache, key } }) => storeOf(cache).has(key)
    ? { found: true, value: storeOf(cache).get(key) }
    : { found: false };

export const cacheSet = ({ input: { cache, key, value } }) => {
    storeOf(cache).set(key, value);
    return null;
};

export const cacheClear = () => stores.clear();
