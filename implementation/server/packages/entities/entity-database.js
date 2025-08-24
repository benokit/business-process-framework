const { getImplementation } = require('system/implementations-registry');

async function execute(dbInstance, request) {
    if (request.method === 'create') {
        const create = getImplementation(dbInstance.configuration.implementation.create);
        return await create(request);
    }

    if (request.method === 'read') {
        const read = getImplementation(dbInstance.configuration.implementation.read);
        return await read(request);
    }

    if (request.method === 'update') {
        const update = getImplementation(dbInstance.configuration.implementation.update);
        return await update(request);
    }

    if (request.method === 'delete') {
        const del = getImplementation(dbInstance.configuration.implementation.delete);
        return await del(request);
    }

    throw 'not supported method';
}

module.exports = {
    execute
}