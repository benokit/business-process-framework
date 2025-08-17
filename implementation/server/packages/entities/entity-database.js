const { getImplementation } = require('system/implementations-loader');

async function execute(dbInstance, request) {
    if (request.method === 'create') {
        const create = getImplementation(dbInstance.configuration.implementation.create);
        return await create(request);
    }

    if (request.method === 'get') {
        const get = getImplementation(dbInstance.configuration.implementation.get);
        return await get(request);
    }

    if (request.method === 'update') {
        const update = getImplementation(dbInstance.configuration.implementation.update);
        return await update(request);
    }

    throw 'not supported method';
}

module.exports = {
    execute
}