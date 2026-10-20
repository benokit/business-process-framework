import express from 'express';
import { randomUUID } from 'crypto';
import { CoreError, invoke } from '@business-framework/core';

const STATUS_BY_CODE = { invalid: 400, unauthorized: 401, forbidden: 403, 'not-found': 404, conflict: 409 };

const newApp = () => express().use(express.json());

let app = newApp();
let server = null;

const errorResponse = error => error instanceof CoreError
    ? { status: STATUS_BY_CODE[error.code] ?? 500, body: { error: { code: error.code, message: error.message } } }
    : { status: 500, body: { error: { code: 'error', message: String(error?.message ?? error) } } };

const respond = (res, { status = 200, headers = {}, body = null }) => res.set(headers).status(status).json(body);

const handler = endpoint => async (req, res) => respond(res, await invoke(endpoint, 'handle', {
    headers: req.headers,
    params: req.params,
    query: req.query,
    body: req.body
}).catch(errorResponse));

export const registerRoute = ({ input: { method, path, endpoint } }) => {
    app[method.toLowerCase()](path, handler(endpoint));
    return null;
};

export const correlationOf = ({ input: headers }) => headers['x-correlation-id'] ?? randomUUID();

export const listen = ({ input: { port } }) => new Promise((resolve, reject) => {
    server = app.listen(Number(port), () => resolve(null)).on('error', reject);
});

export const address = () => ({ port: server.address().port });

export const close = () => new Promise((resolve, reject) => {
    if (!server) return resolve(null);
    server.close(error => error ? reject(error) : resolve(null));
    server.closeAllConnections();
    server = null;
    app = newApp();
});
