import { expect } from 'chai';
import { invoke, validate } from '../src/index.js';
import { bootWith, element, kind, operation } from './helpers.js';

const fill = (id, target, value, order = {}) => ({ id, kind: 'slot-fill', data: { target, slot: 'steps', value, ...order } });

const pipelineKind = cardinality => [
    kind('pipeline-owner', {
        slots: { steps: { cardinality, value: 'string' } },
        operations: { steps: operation({ set: { '$func/slot-values': { element: '#.self.id', slot: 'steps' } } }) }
    }),
    kind('special-owner', { extends: 'pipeline-owner' }),
    element('owner', 'special-owner')
];

const stepsOf = () => invoke('owner', 'steps', null);

describe('slots', () => {
    it('orders many-fills from general to specific target, then by fill id', async () => {
        await bootWith(pipelineKind('many'),
            fill('b', 'owner', 'instance'),
            fill('z', 'pipeline-owner', 'general'),
            fill('a', 'special-owner', 'special'));
        expect(await stepsOf()).to.deep.equal(['general', 'special', 'instance']);
    });

    it('puts positioned fills in the first and last bands', async () => {
        await bootWith(pipelineKind('many'),
            fill('a', 'pipeline-owner', 'middle'),
            fill('b', 'owner', 'first', { position: 'first' }),
            fill('c', 'pipeline-owner', 'last', { position: 'last' }));
        expect(await stepsOf()).to.deep.equal(['first', 'middle', 'last']);
    });

    it('honours after and before', async () => {
        await bootWith(pipelineKind('many'),
            fill('a', 'pipeline-owner', 'a', { after: ['c'] }),
            fill('b', 'pipeline-owner', 'b', { before: ['c'] }),
            fill('c', 'pipeline-owner', 'c'));
        expect(await stepsOf()).to.deep.equal(['b', 'c', 'a']);
    });

    it('reports a cycle, also against the bands', async () => {
        await bootWith(pipelineKind('many'),
            fill('a', 'pipeline-owner', 'a', { position: 'first', after: ['b'] }),
            fill('b', 'pipeline-owner', 'b'));
        expect((await stepsOf().catch(e => e)).code).to.equal('order-cycle');
        expect(validate().map(p => p.code)).to.include('order-cycle');
    });

    it('gives the most specific value of a one-slot', async () => {
        await bootWith(pipelineKind('one'),
            fill('a', 'pipeline-owner', 'general'),
            fill('b', 'special-owner', 'special'));
        expect(await stepsOf()).to.equal('special');
    });

    it('reports fills of unknown slots and invalid values', async () => {
        await bootWith(pipelineKind('many'),
            fill('a', 'pipeline-owner', 42),
            { kind: 'slot-fill', data: { target: 'owner', slot: 'missing', value: 'x' } });
        expect(validate().map(p => p.code)).to.have.members(['invalid-fill', 'unknown-slot']);
    });

    it('accepts slots declared from outside the kind', async () => {
        await bootWith(pipelineKind('many'),
            { id: 'extra', kind: 'slot-declaration', data: { target: 'pipeline-owner', slot: 'extras', cardinality: 'many', value: 'number' } },
            { kind: 'slot-fill', data: { target: 'owner', slot: 'extras', value: 1 } });
        expect(validate()).to.deep.equal([]);
    });
});
