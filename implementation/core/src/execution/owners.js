const owners = new WeakMap();

export const ownedBy = (id, method) => {
    if (method !== null && typeof method === 'object') owners.set(method, id);
    return method;
};

export const ownerOf = method => owners.get(method);
