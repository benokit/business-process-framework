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
            kind('user-scope', { context: { manages: { user: '@principal' } } }),
            kind('handler-kind', {
                extends: 'user-scope',
                shape: { '!handler': '@method' },
                operations: { run: operation({ withContext: { user: { userId: '\\ada' } }, do: { execute: '#.self.data.handler' } }) }
            }),
            element('shared', 'executable', { set: { $coalesce: ['#._ctx.user.userId', '\\unseen'] } }),
            composed('borrowing', { handler: { '/ref': 'shared' } }, 'handler-kind'),
            element('owning', 'handler-kind', { handler: { set: { $coalesce: ['#._ctx.user.userId', '\\unseen'] } } }));
        expect(await invoke('borrowing', 'run', null)).to.equal('unseen');
        expect(await invoke('owning', 'run', null)).to.equal('ada');
    });
});
