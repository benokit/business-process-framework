import { expect } from 'chai';
import { invoke } from '../../src/index.js';
import { instanceMethods } from '../../src/kinds.js';
import { effectsOf, methodChangesOf } from '../../src/analysis/effect-inference.js';
import { bootWith, element, kind, low, operation } from '../helpers.js';

describe('methods in the data of instances', () => {
    beforeEach(() => bootWith(
        kind('rule', { shape: { check: '@method' } }),
        kind('store', { operations: { put: operation(low('record', ['write'])) } }),
        element('the-store', 'store'),
        element('quiet-rule', 'rule', { check: { set: 'quiet' } }),
        element('writing-rule', 'rule', { check: { invoke: 'the-store', operation: 'put' } }),
        element('no-rule', 'rule'),
        kind('driver', {
            operations: {
                run: operation({
                    outputKey: 'rules', set: { '$func/instance-methods': { kind: 'rule', property: 'check' } }
                }),
                runAll: operation([
                    { outputKey: 'rules', set: { '$func/instance-methods': { kind: 'rule', property: 'check' } } },
                    { outputKey: 'found', set: { $find: { collection: '#.rules', predicate: { $eq: ['@rule.id', 'quiet-rule'] }, as: 'rule' } } },
                    { execute: '#.found.method' }
                ])
            }
        }),
        element('the-driver', 'driver')));

    it('lists the methods of the instances that have the property', () => {
        expect(instanceMethods({ kind: 'rule', property: 'check' }).map(({ id }) => id)).to.have.members(['quiet-rule', 'writing-rule']);
    });

    it('runs a method of an instance found in the list', async () => {
        expect(await invoke('the-driver', 'runAll', null)).to.equal('quiet');
    });

    it('counts the effects of every such method in the operation that lists them', () => {
        expect(effectsOf({ element: 'the-driver', operation: 'runAll' })).to.include('write');
    });

    it('gives the changes of one method', () => {
        expect([methodChangesOf({ element: 'quiet-rule', property: 'check' }), methodChangesOf({ element: 'writing-rule', property: 'check' }).length]).to.deep.equal([[], 1]);
    });
});
