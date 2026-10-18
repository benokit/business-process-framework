import { expect } from 'chai';
import { start, stop } from '../src/index.js';
import { calls } from './fixtures/effects.js';
import { bootWith, element, kind, low } from './helpers.js';

const startable = kind('startable', {
    lifecycle: {
        start: { inputMap: { $join: { _strings: ['\\start ', '#.self.id'] } }, ...low('record') },
        stop: { inputMap: { $join: { _strings: ['\\stop ', '#.self.id'] } }, ...low('record') }
    }
});

describe('lifecycle', () => {
    it('starts elements in element id order, independent of load order, and stops in reverse', async () => {
        await bootWith(startable, element('b', 'startable'), element('a', 'startable'));
        await start();
        await stop();
        expect(calls.map(call => call.input)).to.deep.equal(['start a', 'start b', 'stop b', 'stop a']);
    });

    it('runs hooks with an empty root context', async () => {
        await bootWith(startable, element('a', 'startable'));
        await start();
        expect(calls[0]._ctx).to.deep.equal({});
    });
});
