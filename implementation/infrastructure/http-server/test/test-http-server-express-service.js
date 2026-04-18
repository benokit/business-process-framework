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

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

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

describe('http-server (service element)', function () {

    before(async function () {
        await loadElements([
            packageDir('@business-framework/runtime'),
            packageDir('@business-framework/middleware'),
            packageDir('@business-framework/http-server')
        ]);

        // Minimal echo controller: returns its full input so result.body = req.body
        registerElement({
            kind: 'service',
            id: 'test-echo',
            data: {
                interface: {
                    echo: { input: 'object', output: 'object' }
                },
                implementation: {
                    echo: { return: '#.input' }
                }
            }
        });

        registerElement({
            id: 'test-echo-endpoint',
            kind: 'http-endpoint',
            data: {
                method: 'POST',
                path: '/echo',
                controller: { service: 'test-echo', method: 'echo' }
            }
        });
    });

    describe('input validation', () => {

        it('rejects start when port is not a number', async () => {
            let error;
            try {
                await executeService(SERVICE, 'start', { port: 'abc' });
            } catch (e) {
                error = e;
            }
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

    });

    describe('start', () => {
        let port;

        before(async () => {
            ({ port } = await executeService(SERVICE, 'start', { port: 0 }));
        });

        after(async () => {
            await executeService(SERVICE, 'stop', {});
        });

        it('returns the bound port', () => {
            expect(port).to.be.a('number').above(0);
        });

        it('returns 404 for unregistered paths', async () => {
            const { status } = await httpGet(`http://localhost:${port}/unknown`);
            expect(status).to.equal(404);
        });

        it('responds on a registered endpoint', async () => {
            const { status, body } = await httpPost(
                `http://localhost:${port}/echo`,
                { hello: 'world' }
            );
            expect(status).to.equal(200);
            expect(body).to.deep.equal({ hello: 'world' });
        });

    });

    describe('stop', () => {

        it('makes the server unreachable', async () => {
            const { port } = await executeService(SERVICE, 'start', { port: 0 });
            await executeService(SERVICE, 'stop', {});
            let error;
            try {
                await httpGet(`http://localhost:${port}/`);
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });

    });

});
