import { expect } from 'chai';
import { invoke } from '../src/index.js';
import { bootWith, element, kind, operation } from './helpers.js';

describe('private operations', () => {
    beforeEach(() => bootWith(
        kind('safe', {
            operations: {
                secret: { ...operation({ set: 'hidden' }), private: true },
                reveal: operation({ invoke: '#.self.id', operation: 'secret' })
            }
        }),
        kind('thief', { operations: { steal: operation({ invoke: 'a-safe', operation: 'secret' }) } }),
        element('a-safe', 'safe'),
        element('a-thief', 'thief')));

    it('can be called by the operations of the same element only', async () => {
        expect(await invoke('a-safe', 'reveal', null)).to.equal('hidden');
        const errors = await Promise.all([invoke('a-safe', 'secret', null), invoke('a-thief', 'steal', null)].map(call => call.catch(error => error.code)));
        expect(errors).to.deep.equal(['private-operation', 'private-operation']);
    });
});
