const owners = new WeakMap();

export const ownedBy = (id, method, target) => {
    if (method !== null && typeof method === 'object') owners.set(method, { id, target });
    return method;
};

export const ownerOf = method => owners.get(method)?.id;

export const targetOf = method => owners.get(method)?.target;
