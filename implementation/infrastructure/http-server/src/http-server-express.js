import express from 'express';
import { executeMethod } from '@business-framework/core/service';

function createApp() {
    const a = express();
    a.use(express.json());
    return a;
}

let app = createApp();
let server = null;

function register({ input: { path, method, implementation } }) {
    app[method.toLowerCase()](path, async (req, res) => {
        try {
            const result = await executeMethod(implementation, {
                body:    req.body,
                params:  req.params,
                query:   req.query,
                headers: req.headers
            });
            const status  = result?.status  ?? 200;
            const body    = result?.body    ?? null;
            const headers = result?.headers ?? {};
            for (const [key, value] of Object.entries(headers)) res.set(key, value);
            res.status(status).json(body);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    return {};
}

async function start({ input = {} } = {}) {
    const port = input.port ?? 3000;

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
    app = createApp();
    return {};
}

export { start, stop, register };
