import { expect } from 'chai';
import http from 'http';
import { start, stop } from '../src/http-server-express.js';

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
    });
}

describe('http-server-express', function () {

    describe('start / stop', () => {
        let port;

        before(async () => {
            ({ port } = await start({ port: 0 }));
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
            const { port } = await start({ port: 0 });
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
            await expect(stop()).to.be.fulfilled;
        });

    });

});
