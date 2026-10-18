import { expect } from 'chai';
import { start, stop, validate } from '../src/index.js';
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

describe('start order', () => {
    const recorder = (id, lifecycle = {}, extendsKind) => kind(id, {
        ...(extendsKind && { extends: extendsKind }),
        lifecycle: { start: { inputMap: '#.self.id', ...low('record') }, ...lifecycle }
    });

    const started = () => calls.map(call => call.input);

    it('puts kinds with startPosition first or last', async () => {
        await bootWith(
            recorder('resource', { startPosition: 'first' }),
            recorder('entry', { startPosition: 'last' }),
            recorder('plain'),
            element('a-entry', 'entry'), element('b-plain', 'plain'), element('c-resource', 'resource'));
        await start();
        expect(started()).to.deep.equal(['c-resource', 'b-plain', 'a-entry']);
    });

    it('starts after every instance of a named kind, including subkinds', async () => {
        await bootWith(
            kind('database', {}),
            recorder('some-database', {}, 'database'),
            recorder('server', { startAfter: ['database'] }),
            element('a-server', 'server'), element('z-db', 'some-database'));
        await start();
        expect(started()).to.deep.equal(['z-db', 'a-server']);
    });

    it('starts before every instance of a named kind', async () => {
        await bootWith(
            recorder('late'), recorder('early', { startBefore: ['late'] }),
            element('a-late', 'late'), element('b-early', 'early'));
        await start();
        expect(started()).to.deep.equal(['b-early', 'a-late']);
    });

    it('reports unknown kind names and cycles', async () => {
        await bootWith(
            recorder('x', { startAfter: ['y', 'nothing'] }), recorder('y', { startAfter: ['x'] }),
            element('the-x', 'x'), element('the-y', 'y'));
        expect(validate().map(p => p.code)).to.have.members(['unknown-kind', 'order-cycle']);
    });
});
