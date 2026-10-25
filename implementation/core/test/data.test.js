import { expect } from 'chai';
import { getElement, invoke } from '../src/index.js';
import { bootWith, element, kind, operation } from './helpers.js';

const composed = (id, tree, kindId) => ({ id, ...(kindId && { kind: kindId }), '/data': tree });

describe('data composition', () => {
    it('resolves /ref to the data of another element', async () => {
        await bootWith(element('base', 'data', { a: 1 }), composed('copy', { nested: { '/ref': 'base' } }));
        expect(getElement('copy').data).to.deep.equal({ nested: { a: 1 } });
    });

    it('deep merges /merge items, including references', async () => {
        await bootWith(
            element('base', 'data', { a: 1, b: { c: 1 } }),
            composed('extended', { '/merge': [{ '/ref': 'base' }, { b: { d: 2 } }] }));
        expect(getElement('extended').data).to.deep.equal({ a: 1, b: { c: 1, d: 2 } });
    });

    it('keeps /literal values as written', async () => {
        await bootWith(composed('raw', { value: { '/literal': { '/ref': 'nothing' } } }));
        expect(getElement('raw').data).to.deep.equal({ value: { '/ref': 'nothing' } });
    });

    it('composes referenced elements first, whatever the load order', async () => {
        await bootWith(
            composed('outer', { inner: { '/ref': 'middle' } }),
            composed('middle', { '/merge': [{ '/ref': 'leaf' }, { m: true }] }),
            element('leaf', 'data', { l: true }));
        expect(getElement('outer').data).to.deep.equal({ inner: { l: true, m: true } });
    });

    it('reads /uri as text, from a package or a file URL', async () => {
        const text = new URL('./fixtures/statement.sql', import.meta.url).href;
        await bootWith(composed('statements', { fromPackage: { '/uri': '@business-framework/core/test/fixtures/statement.sql' }, fromFile: { '/uri': text } }));
        expect(getElement('statements').data).to.deep.equal({ fromPackage: 'SELECT 1\n', fromFile: 'SELECT 1\n' });
    });

    it('fails on a /uri it can\'t read', async () => {
        const error = await bootWith(composed('missing', { '/uri': '@business-framework/core/nothing.sql' })).catch(e => e);
        expect(error.code).to.equal('unreadable-uri');
    });

    it('fails on a reference cycle', async () => {
        const error = await bootWith(composed('a', { '/ref': 'b' }), composed('b', { '/ref': 'a' })).catch(e => e);
        expect(error.code).to.equal('data-cycle');
    });

    it("fails on an element with both 'data' and '/data'", async () => {
        const error = await bootWith({ id: 'both', data: {}, '/data': {} }).catch(e => e);
        expect(error.code).to.equal('ambiguous-data');
    });

    it('validates composed data against the shape', async () => {
        await bootWith(
            kind('named', { shape: { '!name': 'string' }, operations: { name: operation({ set: '#.self.data.name' }) } }),
            element('names', 'data', { name: 'Ada' }),
            composed('ada', { '/ref': 'names' }, 'named'));
        expect(await invoke('ada', 'name', null)).to.equal('Ada');
    });

    it('keeps the context rights of the element where referenced code is written', async () => {
        await bootWith(
            { kind: 'schema', id: 'principal', data: { '!userId': 'string' } },
            kind('principal-execution-node-wrapper', { context: { manages: { user: '@principal' } } }),
            kind('handler-kind', {
                extends: 'principal-execution-node-wrapper',
                shape: { '!handler': '@method' },
                operations: { run: operation({ execute: '#.self.data.handler' }) }
            }),
            kind('snippet', { shape: '@method' }),
            element('shared', 'snippet', { withContext: { user: { userId: 'ada' } }, do: { set: '#._ctx.user.userId' } }),
            composed('borrowing', { handler: { '/ref': 'shared' } }, 'handler-kind'),
            element('owning', 'handler-kind', { handler: { withContext: { user: { userId: 'ada' } }, do: { set: '#._ctx.user.userId' } } }));
        expect((await invoke('borrowing', 'run', null).catch(e => e)).code).to.equal('context-right');
        expect(await invoke('owning', 'run', null)).to.equal('ada');
    });
});
