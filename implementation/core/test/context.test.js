import { expect } from 'chai';
import { invoke, validate } from '../src/index.js';
import { calls } from './fixtures/effects.js';
import { bootWith, element, kind, low, operation } from './helpers.js';

const principal = { kind: 'schema', id: 'principal', data: { '!userId': 'string' } };

const userScope = kind('user-scope', { context: { manages: { user: '@principal' } } });

const reader = kind('user-reader', {
    context: { reads: ['user'] },
    operations: { whoami: operation({ set: { $coalesce: ['#._ctx.user.userId', '\\nobody'] } }) }
});

const blind = kind('blind', { operations: { look: operation({ set: '#._ctx' }) } });

const sessionKind = kind('session-kind', {
    extends: 'user-scope',
    operations: {
        as: operation({
            withContext: { user: { userId: '#.input' } },
            do: [{ invoke: '\\the-reader', operation: '\\whoami' }]
        })
    }
});

describe('scoped context', () => {
    const boot = (...more) => bootWith(principal, userScope, reader, blind, sessionKind,
        element('session', 'session-kind'), element('the-reader', 'user-reader'), element('the-blind', 'blind'), ...more);

    it('binds a managed key for the subtree only', async () => {
        await boot();
        expect(await invoke('session', 'as', 'ada')).to.equal('ada');
        expect(await invoke('the-reader', 'whoami', null)).to.equal('nobody');
    });

    it('rejects a binding by a kind that does not manage the key', async () => {
        await boot(kind('rogue', { operations: { grant: operation({ withContext: { user: { userId: '\\root' } }, do: { set: 1 } }) } }), element('the-rogue', 'rogue'));
        expect((await invoke('the-rogue', 'grant', null).catch(e => e)).code).to.equal('context-right');
    });

    it('checks a binding against the manager schema', async () => {
        await boot(kind('bad-session', { extends: 'user-scope', operations: { as: operation({ withContext: { user: { name: 1 } }, do: { set: 1 } }) } }), element('bad', 'bad-session'));
        expect((await invoke('bad', 'as', null).catch(e => e)).code).to.equal('invalid');
    });

    it('hides keys the author neither manages nor reads, but carries them on', async () => {
        await boot(kind('carrier', {
            extends: 'user-scope',
            operations: { carry: operation({ withContext: { user: { userId: '\\ada' } }, do: [{ outputKey: 'seen', invoke: '\\the-blind', operation: '\\look' }, { outputKey: 'name', invoke: '\\the-reader', operation: '\\whoami' }, { set: ['#.seen', '#.name'] }] }) }
        }), element('the-carrier', 'carrier'));
        expect(await invoke('the-carrier', 'carry', null)).to.deep.equal([{}, 'ada']);
    });

    it('gives low a frozen context', async () => {
        await boot(kind('mutator', { extends: 'user-scope', operations: { go: operation({ withContext: { user: { userId: '\\ada' } }, do: low('tryToMutateContext') }) } }), element('the-mutator', 'mutator'));
        expect(await invoke('the-mutator', 'go', null).catch(e => e)).to.be.instanceOf(TypeError);
    });

    it('reports unrelated managers and unmanaged reads', async () => {
        await boot(
            kind('other-user-scope', { context: { manages: { user: '@principal' } } }),
            kind('typo', { context: { reads: ['usr'] } }));
        expect(validate().map(p => p.code)).to.have.members(['context-managers', 'unmanaged-context']);
    });
});

describe('execution node wrappers', () => {
    const transactions = [
        { kind: 'schema', id: 'transaction-session', data: { '!sessionId': 'number' } },
        kind('transaction-scope', { extends: 'execution-node-wrapper', context: { manages: { transaction: '@transaction-session' } } }),
        element('in-transaction', 'transaction-scope', {
            keyword: 'inTransaction',
            implementation: {
                if: '#._ctx.transaction',
                then: { next: true },
                else: [
                    { outputKey: 'session', ...low('beginSession') },
                    { outputKey: 'result', withContext: { transaction: '#.session' }, do: { next: true } },
                    { inputMap: '#.session', ...low('endSession') },
                    { return: '#.result' }
                ]
            }
        }),
        kind('repository', {
            context: { reads: ['transaction'] },
            operations: {
                save: operation([
                    { outputKey: 'prefix', set: '\\saved ' },
                    { inTransaction: [{ inTransaction: { set: { $join: { _strings: ['#.prefix', '#.input', '\\ in ', '#._ctx.transaction.sessionId'] } } } }] }
                ])
            }
        }),
        element('orders', 'repository')
    ];

    it("runs the wrapped pipeline in the caller's context, joining an enclosing scope", async () => {
        await bootWith(transactions);
        expect(await invoke('orders', 'save', 'order')).to.equal('saved order in 1');
        expect(calls).to.deep.equal([{ begin: true }, { end: { sessionId: 1 } }]);
    });
});
