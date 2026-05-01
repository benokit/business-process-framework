import { expect } from 'chai';
import { dirname } from 'path';
import { createRequire } from 'module';
import http from 'http';
import { loadElements } from '@business-framework/runtime/elements-loader';
import { executeService } from '@business-framework/runtime/execution';
import { registerElement } from '@business-framework/runtime/elements-registry';

const require = createRequire(import.meta.url);
const packageDir = name => dirname(require.resolve(`${name}/package.json`));
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

// Helper: builds an inputMap that merges `patch` into the request body and calls next
function injectIntoBody(patch) {
    return {
        inputMap: {
            body: { $merge: ['#.input.input.body', patch] },
            params: '#.input.input.params',
            query:  '#.input.input.query',
            headers: '#.input.input.headers'
        },
        execute: '#.input.next'
    };
}

describe('http-middleware', function () {
    let port;

    before(async function () {
        await loadElements([
            packageDir('@business-framework/definitions'),
            packageDir('@business-framework/middleware'),
            packageDir('@business-framework/http-server')
        ]);

        // Controller: echoes request body back as the HTTP response body
        registerElement({
            kind: 'service',
            id: 'mw-echo',
            data: {
                interface: { echo: { input: 'object', output: 'object' } },
                implementation: { echo: { return: '#.input' } }
            }
        });

        registerElement({
            id: 'mw-endpoint',
            kind: 'http-endpoint',
            data: { method: 'POST', path: '/mw-test', controller: { service: 'mw-echo', method: 'echo' } }
        });

        // ordering 1 — injects step1:true and sets lastStep:1
        registerElement({
            id: 'mw-1', kind: 'middleware/http',
            data: { ordering: 1, implementation: injectIntoBody({ step1: true, lastStep: 1 }) }
        });

        // ordering 2 — injects step2:true and overwrites lastStep:2
        registerElement({
            id: 'mw-2', kind: 'middleware/http',
            data: { ordering: 2, implementation: injectIntoBody({ step2: true, lastStep: 2 }) }
        });

        // ordering 3 — injects the endpointId into the body so we can assert it
        registerElement({
            id: 'mw-3', kind: 'middleware/http',
            data: {
                ordering: 3,
                implementation: {
                    inputMap: {
                        body: { $merge: ['#.input.input.body', { endpointId: '#.input.context.endpointId' }] },
                        params:  '#.input.input.params',
                        query:   '#.input.input.query',
                        headers: '#.input.input.headers'
                    },
                    execute: '#.input.next'
                }
            }
        });

        ({ port } = await executeService(SERVICE, 'start', { port: 0 }));
    });

    after(async function () {
        await executeService(SERVICE, 'stop', {});
    });

    it('all middlewares are applied', async function () {
        const { status, body } = await httpPost(`http://localhost:${port}/mw-test`, { original: true });
        expect(status).to.equal(200);
        expect(body.original).to.be.true;
        expect(body.step1).to.be.true;
        expect(body.step2).to.be.true;
    });

    it('middlewares executeService in ascending ordering', async function () {
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
            id: 'mw-block', kind: 'middleware/http',
            data: {
                ordering: 0,
                implementation: { return: { status: 403, body: { error: 'blocked' } } }
            }
        });

        ({ port } = await executeService(SERVICE, 'start', { port: 0 }));
    });

    after(async function () {
        await executeService(SERVICE, 'stop', {});
    });

    it('returns the middleware response without reaching the controller', async function () {
        const { status, body } = await httpPost(`http://localhost:${port}/mw-test`, { original: true });
        expect(status).to.equal(403);
        expect(body).to.deep.equal({ error: 'blocked' });
    });
});
