import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { loadElements } from 'core/elements-loader';
import { execute } from 'core/service';
import { registerElement } from 'core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTTP_SERVER_ELEMENTS_DIR = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR         = join(__dirname, '../../../core/elements');
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
        await loadElements([CORE_ELEMENTS_DIR, HTTP_SERVER_ELEMENTS_DIR]);

        // Minimal echo controller: returns its full input so result.body = req.body
        registerElement({
            type: 'service',
            id: 'test-echo',
            interface: {
                echo: { input: 'object', output: 'object' }
            },
            implementation: {
                echo: { return: '#.input' }
            }
        });

        registerElement({
            type: 'data',
            id: 'test-echo-endpoint',
            meta: { kind: 'endpoint' },
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
                await execute(SERVICE, 'start', { port: 'abc' });
            } catch (e) {
                error = e;
            }
            expect(error).to.be.a('string').that.includes('input is not valid');
        });

    });

    describe('start', () => {
        let port;

        before(async () => {
            ({ port } = await execute(SERVICE, 'start', { port: 0 }));
        });

        after(async () => {
            await execute(SERVICE, 'stop', {});
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
            const { port } = await execute(SERVICE, 'start', { port: 0 });
            await execute(SERVICE, 'stop', {});
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
