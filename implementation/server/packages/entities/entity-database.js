const { getImplementation } = require('system/implementations-loader');

async function execute(dbInstance, request) {
    if (request.method === 'create') {
        const create = getImplementation(dbInstance.configuration.implementation.create);
        return await create(request);
    }
}

module.exports = {
    execute
}