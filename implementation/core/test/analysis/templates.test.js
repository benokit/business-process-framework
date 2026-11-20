import { expect } from 'chai';
import { validate } from '../../src/index.js';
import { bootWith, element, kind } from '../helpers.js';

const problemsOf = () => validate().map(({ code, data }) => [code, data.path]);

const recordKind = templates => kind('entry', {
    shape: { '!record': 'string', '!rule': '@mapping/rule-code' },
    templates
});

const RULE = { input: { '!amount': 'number', '!name': 'string' }, output: 'number' };

describe('templates', () => {
    it('types a mapping with the input and output a template resolves to', async () => {
        await bootWith(
            recordKind({ 'rule-code': { input: { $literal: RULE.input }, output: 'number' } }),
            element('good-entry', 'entry', { record: 'a', rule: { $sum: ['#.amount', 1] } }),
            element('bad-entry', 'entry', { record: 'a', rule: '#.amnout' }));
        expect(problemsOf()).to.deep.equal([['unknown-path', 'rule']]);
    });

    it('resolves a template from the data of the element', async () => {
        await bootWith(
            recordKind({ 'rule-code': { input: { $literal: { '!amount': 'number' } } } }),
            element('typed-entry', 'entry', { record: 'a', rule: '#.amount' }));
        expect(problemsOf()).to.deep.equal([]);
    });

    it('reports a name no kind of the chain declares', async () => {
        await bootWith(recordKind({}), element('lost-entry', 'entry', { record: 'a', rule: 1 }));
        expect(problemsOf()).to.deep.equal([['unresolved-template', 'rule']]);
    });

    it('reports a template that resolves to something else than a schema', async () => {
        await bootWith(
            recordKind({ 'rule-code': { $sum: [1, 2] } }),
            element('odd-entry', 'entry', { record: 'a', rule: 1 }));
        expect(problemsOf()).to.deep.equal([['invalid-template', 'rule']]);
    });

    it('checks the mapping of a template against the shape of its kind', async () => {
        await bootWith(recordKind({ 'rule-code': { input: '#.data.recrod' } }));
        expect(problemsOf()).to.deep.equal([['unknown-path', 'templates.rule-code.input']]);
    });

    it('resolves a hole in the input of a slot against the target of the fill', async () => {
        await bootWith(
            kind('catalogue', {
                shape: { '!unit': 'string' },
                slots: { checks: { cardinality: 'many', value: '@method', input: { '!item': '@type/item', '!note': 'string' } } },
                templates: { item: { $literal: { '!price': 'number' } } }
            }),
            element('fruit', 'catalogue', { unit: 'kg' }),
            { id: 'fruit-check', kind: 'slot-fill', data: { target: 'fruit', slot: 'checks', value: { set: { $sum: ['#.input.item.price', 1] } } } },
            { id: 'fruit-typo', kind: 'slot-fill', data: { target: 'fruit', slot: 'checks', value: { set: '#.input.item.prize' } } });
        expect(problemsOf()).to.deep.equal([['unknown-path', 'value.set']]);
    });
});
