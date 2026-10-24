import { expect } from 'chai';
import { boot, invoke, packageElements, start, stop, validate } from '@business-framework/core';

const echo = {
    id: 'echo',
    kind: 'kind',
    data: {
        operations: {
            echo: { input: '@any', implementation: { set: '#.input' } },
            correlation: { input: '@any', implementation: { set: { correlation: '#._ctx.trace.correlation' } } },
            strict: { input: { '!amount': 'number' }, implementation: { set: '#.input' } },
            fail: { input: '@any', implementation: { throw: '\\broken' } }
        }
    }
};

const endpoint = (id, method, path, target, extra = {}) => ({ id, kind: 'http-endpoint', data: { method, path, target: { element: 'the-echo', operation: target }, ...extra } });

const fill = (id, value, order = {}) => ({ id, kind: 'slot-fill', data: { target: 'http-endpoint', slot: 'requestMiddleware', value, ...order } });

const elements = [
    { kind: 'app-config', data: { http: { port: 0 } } },
    echo,
    { id: 'the-echo', kind: 'echo', data: {} },
    endpoint('echo-body', 'POST', '/echo', 'echo'),
    endpoint('mapped', 'GET', '/items/:id', 'echo', {
        request: { id: '#.params.id', sort: '#.query.sort' },
        response: { status: 201, headers: { 'x-item': '#.output.id' }, body: { item: '#.output' } }
    }),
    endpoint('correlated', 'GET', '/correlation', 'correlation'),
    endpoint('strict', 'POST', '/strict', 'strict'),
    endpoint('failing', 'GET', '/fail', 'fail'),
    fill('tag-request', { inputMap: { $merge: ['#.input', { body: { tagged: true } }] }, next: true }),
    fill('block-forbidden', { if: { $eq: ['#.input.headers.x-block', '\\yes'] }, then: { set: { status: 403, body: { error: '\\blocked' } } }, else: { next: true } }, { position: 'first' })
];

const call = async (path, options = {}) => {
    const { port } = await invoke('http-server', 'address', null);
    const response = await fetch(`http://localhost:${port}${path}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...options.headers },
        ...(options.body && { body: JSON.stringify(options.body) })
    });
    return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
};

describe('http-server', () => {
    before(async () => {
        await boot({ paths: [packageElements('@business-framework/http-server')], elements });
        await start();
    });

    after(stop);

    it('validates', () => {
        expect(validate()).to.deep.equal([]);
    });

    it('passes the body to the target and returns its output with status 200', async () => {
        const { status, body } = await call('/echo', { method: 'POST', body: { hello: 'world' } });
        expect(status).to.equal(200);
        expect(body).to.deep.equal({ hello: 'world', tagged: true });
    });

    it('maps the request and the response', async () => {
        const { status, headers, body } = await call('/items/7?sort=name');
        expect(status).to.equal(201);
        expect(headers.get('x-item')).to.equal('7');
        expect(body).to.deep.equal({ item: { id: '7', sort: 'name' } });
    });

    it('binds the trace context, with the correlation from the header', async () => {
        expect((await call('/correlation', { headers: { 'x-correlation-id': 'c-1' } })).body).to.deep.equal({ correlation: 'c-1' });
        expect((await call('/correlation')).body.correlation).to.be.a('string').with.length.above(0);
    });

    it('lets request middleware short-circuit', async () => {
        const { status, body } = await call('/echo', { method: 'POST', body: {}, headers: { 'x-block': 'yes' } });
        expect(status).to.equal(403);
        expect(body).to.deep.equal({ error: 'blocked' });
    });

    it('maps contract violations to 400 and other errors to 500', async () => {
        const invalid = await call('/strict', { method: 'POST', body: { amount: 'x' } });
        const failing = await call('/fail');
        expect([invalid.status, invalid.body.error.code]).to.deep.equal([400, 'invalid']);
        expect([failing.status, failing.body.error.message]).to.deep.equal([500, 'broken']);
    });

    it('answers 404 for unknown paths', async () => {
        expect((await call('/unknown')).status).to.equal(404);
    });
});

describe('http-endpoint validation', () => {
    it('reports a target that is not an element or lacks the operation', async () => {
        await boot({
            paths: [packageElements('@business-framework/http-server')],
            elements: [echo, { id: 'the-echo', kind: 'echo', data: {} }, endpoint('typo', 'GET', '/typo', 'ecco'),
                { id: 'missing', kind: 'http-endpoint', data: { method: 'GET', path: '/missing', target: { element: 'nobody', operation: 'echo' } } }]
        });
        expect(validate().map(({ code, message }) => [code, message])).to.deep.equal([
            ['unknown-element', "missing target.element: refers to unknown element 'nobody'"],
            ['invalid-element', 'typo: target the-echo has no operation ecco']
        ]);
    });

    it('reports a GET target that changes state', async () => {
        const writer = { id: 'writer', kind: 'kind', data: { operations: { save: { input: '@any', implementation: { low: { module: '@business-framework/http-server', export: 'address', effects: ['write'] } } } } } };
        await boot({
            paths: [packageElements('@business-framework/http-server')],
            elements: [writer, { id: 'the-writer', kind: 'writer', data: {} },
                { id: 'unsafe', kind: 'http-endpoint', data: { method: 'GET', path: '/unsafe', target: { element: 'the-writer', operation: 'save' } } },
                { id: 'safe', kind: 'http-endpoint', data: { method: 'POST', path: '/safe', target: { element: 'the-writer', operation: 'save' } } }]
        });
        expect(validate().map(({ code, message }) => [code, message])).to.deep.equal([
            ['invalid-element', 'unsafe: a GET target changes state, write: low address']
        ]);
    });
});
