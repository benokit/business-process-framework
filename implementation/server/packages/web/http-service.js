const express = require('express');
const { getImplementation } = require('system/implementations-registry');
const { getInstancesOfClass } = require('system/instances-registry');
const { valuesIn } = require('lodash');

let service = null;

function startService(configuration) {
    if (service) {
        return;
    }

    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    registerEndpoints(app);

    service = app.listen(configuration.port, () => {
        console.log(`Server running on port ${configuration.port}`);
    });
}

function getHandler(routeDefinition) {
    const handler = getImplementation(routeDefinition.handler);
    return async (req, res) => {
        try {
            const result = await handler(req);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

function addRoute(app, routeDefinition) {
    switch (routeDefinition.method) {
        case 'GET': 
           app.get(routeDefinition.uri, getHandler(routeDefinition));
           break;
        case 'POST':
           app.post(routeDefinition.uri, getHandler(routeDefinition));
           break;
        case 'PUT':
           app.put(routeDefinition.uri, getHandler(routeDefinition));
           break;
        case 'DELETE':
           app.put(routeDefinition.uri, getHandler(routeDefinition));
           break;
    }
}

function registerEndpoints(app) {
    const webControllers = getInstancesOfClass('http-controller');
    for (const webController of webControllers) {
        for (const endpoint of valuesIn(webController.configuration.endpoints)) {
            addRoute(app, endpoint);
        }
    } 
}

function execute({ configuration }, request) {
    if (request.method === 'start') {
        startService(configuration);
    }
}

module.exports = {
    execute
}