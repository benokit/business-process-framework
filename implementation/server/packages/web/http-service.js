import express from 'express';
import { getInstancesOfClass } from 'system/instances-registry.js';

export {
    startService
}

let service = null;

async function startService(configuration) {
    if (service) {
        return;
    }

    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    await registerEndpoints(app);

    service = app.listen(configuration.port, () => {
        console.log(`Server running on port ${configuration.port}`);
    });
}

async function getHandler(routeDefinition) {
    const [method, module] = routeDefinition.handler.split('@', 2);
    const handler = (await import(module))[method];
    return async (req, res) => {
        try {
            const result = await handler(req);
            res.json(result);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    }
}

async function addRoute(app, routeDefinition) {
    switch (routeDefinition.method) {
        case 'GET': 
           app.get(routeDefinition.uri, await getHandler(routeDefinition));
           break;
        case 'POST':
           app.post(routeDefinition.uri, await getHandler(routeDefinition));
           break;
        case 'PUT':
           app.put(routeDefinition.uri, await getHandler(routeDefinition));
           break;
        case 'DELETE':
           app.put(routeDefinition.uri, await getHandler(routeDefinition));
           break;
    }
}

async function registerEndpoints(app) {
    const webControllers = getInstancesOfClass('http-controller');
    for (const webController of webControllers) {
        console.log('registering endpoints of web controller ' + webController.id);
        for (const endpoint of webController.configuration.endpoints) {
            console.log('- endpoint: ' + endpoint.uri);
            await addRoute(app, endpoint);
        }
    } 
}
