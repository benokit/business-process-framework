import { expect } from 'chai';
import { invoke, validate } from '../src/index.js';
import { slotValues } from '../src/slots.js';
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
    it('names the fill in the route of an error it raises', async () => {
        await bootWith(
            kind('guarded', {
                slots: { guards: { cardinality: 'many', value: '@method' } },
                operations: { go: operation([
                    { outputKey: 'guards', set: { '$func/slot-values': { element: '#.self.id', slot: 'guards' } } },
                    { forEach: { execute: '#.item' }, inputMap: '#.guards' }
                ]) }
            }),
            element('the-guarded', 'guarded'),
            { id: 'refuse-all', kind: 'slot-fill', data: { target: 'guarded', slot: 'guards', value: { throw: { code: 'conflict', message: 'no' } } } });
        const error = await invoke('the-guarded', 'go', null).catch(e => e);
        expect(error.data.frames).to.deep.equal(['the-guarded.go', 'step 2 forEach', 'step 1 execute', 'refuse-all', 'step 1 throw']);
    });

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

    describe('discriminator', () => {
        const changes = [
            kind('changes', {
                slots: { reactions: {
                    cardinality: 'many',
                    value: 'string',
                    discriminator: 'operation',
                    input: { '$data#1': [{ '!operation=': 'read', '!before': 'string' }, { '!operation=': 'trait', '!commands[]': 'string' }, { '!operation=': 'delete', '!before': 'string' }] }
                } },
                operations: { on: operation({ set: { '$func/slot-values': { element: '#.self.id', slot: 'reactions', on: '#.input' } } }, 'string') }
            }),
            element('the-changes', 'changes')
        ];
        const reaction = (id, value, data = {}) => ({ id, kind: 'slot-fill', data: { target: 'changes', slot: 'reactions', value, ...data } });
        const on = operationName => invoke('the-changes', 'on', operationName);

        it('selects the fills that handle the variant, and those that handle all', async () => {
            await bootWith(changes,
                reaction('a', 'reads', { on: ['read'] }),
                reaction('b', 'writes', { on: ['trait', 'delete'] }),
                reaction('c', 'all'));
            expect(await on('read')).to.deep.equal(['reads', 'all']);
            expect(await on('trait')).to.deep.equal(['writes', 'all']);
            expect(await on('delete')).to.deep.equal(['writes', 'all']);
        });

        it('keeps the order of the whole slot, also through a fill it skips', async () => {
            await bootWith(changes,
                reaction('a', 'a', { on: ['read'], after: ['b'] }),
                reaction('b', 'b', { on: ['trait'], after: ['c'] }),
                reaction('c', 'c', { on: ['read'] }));
            expect(await on('read')).to.deep.equal(['c', 'a']);
        });

        it('refuses a variant on a slot without a discriminator', async () => {
            await bootWith(pipelineKind('many'));
            expect(() => slotValues({ element: 'owner', slot: 'steps', on: 'read' })).to.throw(/no discriminator/);
        });

        it('reports an on outside the domain or on a slot without a discriminator', async () => {
            await bootWith(changes, pipelineKind('many'),
                reaction('a', 'x', { on: ['update'] }),
                fill('b', 'owner', 'x', { on: ['read'] }));
            expect(validate().map(p => [p.code, p.data.slot])).to.have.deep.members([['unknown-variant', 'reactions'], ['not-filterable', 'steps']]);
        });

        it('reports a literal variant the slot lacks where the slot is read', async () => {
            await bootWith(
                kind('reader', {
                    slots: { reactions: { cardinality: 'many', value: 'string', discriminator: 'operation', input: { '!operation=1': ['read', 'trait'] } } },
                    operations: { run: operation([
                        { set: { '$func/slot-values': { element: '#.self.id', slot: 'reactions', on: 'read' } } },
                        { set: { '$func/slot-values': { element: '#.self.id', slot: 'reactions', on: 'update' } } }
                    ]) }
                }));
            expect(validate().map(p => [p.code, p.data.path])).to.deep.equal([['unknown-variant', 'operations.run.implementation[1].set.$func/slot-values.on']]);
        });

        it('reports a discriminator the input does not have, or a one-slot with one', async () => {
            await bootWith(
                kind('untagged', { slots: { reactions: { cardinality: 'many', value: 'string', discriminator: 'operation', input: { '!count': 'number' } } } }),
                kind('single', { slots: { choice: { cardinality: 'one', value: 'string', discriminator: 'operation', input: { '!operation=1': ['read'] } } } }));
            expect(validate().map(p => [p.code, p.data.kind])).to.have.deep.members([['invalid-discriminator', 'untagged'], ['invalid-discriminator', 'single']]);
        });
    });

    it('accepts slots declared from outside the kind', async () => {
        await bootWith(pipelineKind('many'),
            { id: 'extra', kind: 'slot-declaration', data: { target: 'pipeline-owner', slot: 'extras', cardinality: 'many', value: 'number' } },
            { kind: 'slot-fill', data: { target: 'owner', slot: 'extras', value: 1 } });
        expect(validate()).to.deep.equal([]);
    });
});
