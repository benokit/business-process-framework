import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { loadElements } from '@business-framework/core/elements-loader';
import { execute } from '@business-framework/core/service';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTTP_SERVER_ELEMENTS_DIR = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR         = join(__dirname, '../../../core/elements');
const SERVICE = 'http-server';

function httpPost(url, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const { hostname, port, pathname } = new URL(url);
        const req = http.request(
            { hostname, port, path: pathname, method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
            (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
            }
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Helper: builds an inputMap that merges `patch` into the httpRequest body and calls next
function injectIntoBody(patch) {
    return {
        inputMap: {
            body: { $merge: ['#.input.httpRequest.body', patch] },
            params: '#.input.httpRequest.params',
            query:  '#.input.httpRequest.query',
            headers: '#.input.httpRequest.headers'
        },
        execute: '#.input.next'
    };
}

describe('http-middleware', function () {
    let port;

    before(async function () {
        await loadElements([CORE_ELEMENTS_DIR, HTTP_SERVER_ELEMENTS_DIR]);

        // Controller: echoes request body back as the HTTP response body
        registerElement({
            type: 'service',
            id: 'mw-echo',
            interface: { echo: { input: 'object', output: 'object' } },
            implementation: { echo: { return: '#.input' } }
        });

        registerElement({
            type: 'data',
            id: 'mw-endpoint',
            kind: 'http-endpoint',
            data: { method: 'POST', path: '/mw-test', controller: { service: 'mw-echo', method: 'echo' } }
        });

        // ordering 1 — injects step1:true and sets lastStep:1
        registerElement({
            type: 'data', id: 'mw-1', kind: 'http-middleware',
            data: { ordering: 1, implementation: injectIntoBody({ step1: true, lastStep: 1 }) }
        });

        // ordering 2 — injects step2:true and overwrites lastStep:2
        registerElement({
            type: 'data', id: 'mw-2', kind: 'http-middleware',
            data: { ordering: 2, implementation: injectIntoBody({ step2: true, lastStep: 2 }) }
        });

        // ordering 3 — injects the endpointId into the body so we can assert it
        registerElement({
            type: 'data', id: 'mw-3', kind: 'http-middleware',
            data: {
                ordering: 3,
                implementation: {
                    inputMap: {
                        body: { $merge: ['#.input.httpRequest.body', { endpointId: '#.input.endpointId' }] },
                        params:  '#.input.httpRequest.params',
                        query:   '#.input.httpRequest.query',
                        headers: '#.input.httpRequest.headers'
                    },
                    execute: '#.input.next'
                }
            }
        });

        ({ port } = await execute(SERVICE, 'start', { port: 0 }));
    });

    after(async function () {
        await execute(SERVICE, 'stop', {});
    });

    it('all middlewares are applied', async function () {
        const { status, body } = await httpPost(`http://localhost:${port}/mw-test`, { original: true });
        expect(status).to.equal(200);
        expect(body.original).to.be.true;
        expect(body.step1).to.be.true;
        expect(body.step2).to.be.true;
    });

    it('middlewares execute in ascending ordering', async function () {
        // mw-1 sets lastStep:1, then mw-2 overwrites with lastStep:2.
        // If ordering were reversed the value would be 1.
        const { body } = await httpPost(`http://localhost:${port}/mw-test`, {});
        expect(body.lastStep).to.equal(2);
    });

    it('endpointId is passed to each middleware', async function () {
        const { body } = await httpPost(`http://localhost:${port}/mw-test`, {});
        expect(body.endpointId).to.equal('mw-endpoint');
    });
});

describe('http-middleware short-circuit', function () {
    let port;

    before(async function () {
        // ordering 0 — runs before mw-1/2/3 and returns without calling next
        registerElement({
            type: 'data', id: 'mw-block', kind: 'http-middleware',
            data: {
                ordering: 0,
                implementation: { return: { status: 403, body: { error: 'blocked' } } }
            }
        });

        ({ port } = await execute(SERVICE, 'start', { port: 0 }));
    });

    after(async function () {
        await execute(SERVICE, 'stop', {});
    });

    it('returns the middleware response without reaching the controller', async function () {
        const { status, body } = await httpPost(`http://localhost:${port}/mw-test`, { original: true });
        expect(status).to.equal(403);
        expect(body).to.deep.equal({ error: 'blocked' });
    });
});
