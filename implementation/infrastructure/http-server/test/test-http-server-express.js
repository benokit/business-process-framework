import { expect } from 'chai';
import http from 'http';
import { start, stop, register } from '../src/http-server-express.js';

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

describe('http-server-express', function () {

    describe('start / stop', () => {
        let port;

        before(async () => {
            ({ port } = await start({ input: { port: 0 } }));
        });

        after(async () => {
            await stop();
        });

        it('returns the actual bound port', () => {
            expect(port).to.be.a('number').above(0);
        });

        it('server is reachable after start', async () => {
            const res = await httpGet(`http://localhost:${port}/`);
            // no endpoints registered — express returns 404
            expect(res.status).to.equal(404);
        });

    });

    describe('stop', () => {

        it('server is no longer reachable after stop', async () => {
            const { port } = await start({ input: { port: 0 } });
            await stop();
            let error;
            try {
                await httpGet(`http://localhost:${port}/`);
            } catch (e) {
                error = e;
            }
            expect(error).to.exist;
        });

        it('calling stop when not started is a no-op', async () => {
            const result = await stop();
            expect(result).to.deep.equal({});
        });

    });

    describe('register', () => {
        let port;

        before(async () => {
            register({
                input: {
                    method: 'POST',
                    path: '/ping',
                    implementation: { service: { id: 'test-ping', method: 'ping' } }
                }
            });
            ({ port } = await start({ input: { port: 0 } }));
        });

        after(async () => {
            await stop();
        });

        it('returns {}', () => {
            const result = register({
                input: {
                    method: 'GET',
                    path: '/noop',
                    implementation: { service: { id: 'test-noop', method: 'noop' } }
                }
            });
            expect(result).to.deep.equal({});
        });

        it('registered endpoint is reachable after start', async () => {
            // The controller does not exist, so we expect a 500 error response (not a connection error)
            const { status } = await httpPost(`http://localhost:${port}/ping`, {});
            expect(status).to.equal(500);
        });

        it('unregistered path returns 404', async () => {
            const { status } = await httpGet(`http://localhost:${port}/unknown`);
            expect(status).to.equal(404);
        });

    });

});
