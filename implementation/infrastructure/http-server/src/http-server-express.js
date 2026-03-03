import express from 'express';
import { getElements } from 'core/elements-registry';
import { execute } from 'core/service';

let server = null;

async function start({ port = 3000 } = {}) {
    const app = express();
    app.use(express.json());

    const endpoints = getElements('data', 'endpoint');
    for (const endpoint of endpoints) {
        const { method, path, controller } = endpoint.data;
        app[method.toLowerCase()](path, async (req, res) => {
            try {
                const result = await execute(controller.service, controller.method, {
                    body:    req.body,
                    params:  req.params,
                    query:   req.query,
                    headers: req.headers
                });
                const status = result?.status ?? 200;
                const body   = result?.body   ?? null;
                res.status(status).json(body);
            } catch (error) {
                res.status(500).json({ error: String(error) });
            }
        });
    }

    await new Promise((resolve, reject) => {
        server = app.listen(port, resolve);
        server.on('error', reject);
    });

    return { port: server.address().port };
}

async function stop() {
    if (!server) return {};
    await new Promise((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve());
    });
    server = null;
    return {};
}

export { start, stop };
