import { expect } from 'chai';
import { applyMapping } from '../src/mappings.js';

const templated = (mapping, input = {}) => applyMapping({ mapping, input });

describe('$template', () => {
    it('returns its mapping as data, with the names of `with` filled in and everything else untouched', () => {
        expect(templated({
            $template: {
                with: { transition: '#.name' },
                mapping: { $any: { collection: '#.commands', as: 'command', predicate: { $eq: ['@command', { $literal: { command: '@transition' } }] } } }
            }
        }, { name: 'issue' })).to.deep.equal({
            $any: { collection: '#.commands', as: 'command', predicate: { $eq: ['@command', { $literal: { command: 'issue' } }] } }
        });
    });

    it('fills a path of a bound name, and keeps an unknown name as it is', () => {
        expect(templated({ $template: { with: { target: { id: '#.id' } }, mapping: ['@target.id', '@other.id', '@target'] } }, { id: 7 }))
            .to.deep.equal([7, '@other.id', { id: 7 }]);
    });

    it('fills a name used as a key, with the string it is bound to', () => {
        expect(templated({ $template: { with: { role: '#.role' }, mapping: { '@role': '#.businessKey' } } }, { role: 'contract' }))
            .to.deep.equal({ contract: '#.businessKey' });
    });

    it('binds only the names of `with`, not the properties every object has', () => {
        expect(templated({ $template: { mapping: ['@toString', '@constructor'] } })).to.deep.equal(['@toString', '@constructor']);
    });

    it('protects a value that would otherwise be read as an expression', () => {
        expect(templated({ $template: { with: { a: '#.text', b: { $literal: { list: ['@x'] } } }, mapping: { first: '@a', second: '@b' } } }, { text: '#.secret' }))
            .to.deep.equal({ first: '\\#.secret', second: { list: ['\\@x'] } });
    });

    it('can be applied later: the filled mapping runs', () => {
        const filled = templated({ $template: { with: { field: '#.field' }, mapping: { $str: ['#.value', '-', '@field'] } } }, { field: 'x' });
        expect(templated(filled, { value: 'v' })).to.equal('v-x');
    });

    it('takes { with?, mapping }', () => {
        expect(() => templated({ $template: { with: {} } })).to.throw(/takes \{ with\?, mapping \}/);
        expect(() => templated({ $template: { mapping: 1, extra: 2 } })).to.throw(/takes \{ with\?, mapping \}/);
        expect(templated({ $template: { mapping: { $literal: 1 } } })).to.deep.equal({ $literal: 1 });
    });
});
