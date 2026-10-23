import { expect } from 'chai';
import { boot, invoke, packageElements, validate } from '@business-framework/core';

const elements = [
    { id: 'who', kind: 'kind', data: { operations: { system: { input: '@any', implementation: { asSystem: { set: '#._ctx.user' } } }, plain: { input: '@any', implementation: { set: { $coalesce: ['#._ctx.user', '\\nobody'] } } } } } },
    { id: 'the-who', kind: 'who', data: {} },
    { id: 'rogue', kind: 'kind', data: { operations: { grant: { input: '@any', implementation: { withContext: { user: { userId: '\\root' } }, do: { set: 1 } } } } } },
    { id: 'the-rogue', kind: 'rogue', data: {} }
];

describe('security', () => {
    before(() => boot({ paths: [packageElements('@business-framework/security')], elements }));

    it('validates, reporting only the kind that binds the principal without managing it', () => {
        expect(validate().map(({ code, data }) => [code, data.element, data.key])).to.deep.equal([['context-right', 'rogue', 'user']]);
    });

    it('runs a pipeline as the system principal', async () => {
        expect(await invoke('the-who', 'system', null)).to.deep.equal({ userId: 'system', roles: ['system'] });
        expect(await invoke('the-who', 'plain', null)).to.equal('nobody');
    });

    it('lets no other kind bind the principal at run time', async () => {
        expect((await invoke('the-rogue', 'grant', null).catch(e => e)).code).to.equal('context-right');
    });
});
