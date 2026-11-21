import { expect } from 'chai';
import { invoke, validate } from '../src/index.js';
import { applyMapping } from '../src/mappings.js';
import { bootWith, element, kind, runner } from './helpers.js';

const library = (id, data) => element(id, 'function-library', data);

const calculator = total => [
    kind('calculator', { shape: { total: '@mapping' } }),
    element('the-calculator', 'calculator', { total })
];

const arithmetic = library('arithmetic', {
    functions: { $double: { $multiply: ['#', 2] }, $quadruple: { $double: { $double: '#' } }, $text: { $str: ['#'] } },
    signatures: { $text: { input: 'integer', output: 'string' } },
    exports: ['$quadruple', '$text']
});

const run = mapping => applyMapping({ mapping, input: null });

const problems = () => validate().filter(({ data }) => data?.severity !== 'warning').map(({ code, data }) => [code, data?.path]);

describe('function libraries', () => {
    it('give their exports to every mapping, qualified or after $include', async () => {
        await bootWith([arithmetic]);
        expect(run({ '$arithmetic/quadruple': 3 })).to.equal(12);
        expect(run({ $include: ['arithmetic'], $in: { $quadruple: 3 } })).to.equal(12);
    });

    it('keep the functions that are not exported private, while the exports use them', async () => {
        await bootWith([arithmetic]);
        expect(() => run({ '$arithmetic/double': 3 })).to.throw();
        await bootWith([arithmetic, ...calculator({ '$arithmetic/double': 3 })]);
        expect(problems()).to.deep.equal([['unknown-function', 'total.$arithmetic/double']]);
    });

    it('let a library use another one, whatever the order they are written in', async () => {
        const second = library('second', { functions: { $six: { '$arithmetic/quadruple': 1.5 } } });
        await bootWith([second, arithmetic]);
        expect(run({ '$second/six': null })).to.equal(6);
    });

    it('check the argument and the result of a function that has a signature, outside production', async () => {
        await bootWith([arithmetic]);
        expect(run({ '$arithmetic/text': 7 })).to.equal('7');
        expect(() => run({ '$arithmetic/text': 'seven' })).to.throw().with.property('code', 'function-contract');
    });

    it('are known to validate(), which reports a misspelled function and an unknown library', async () => {
        await bootWith([arithmetic, ...calculator({ '$arithmetic/text': 7 })]);
        expect(problems()).to.deep.equal([]);
        await bootWith([arithmetic, ...calculator({ '$arithmetic/quadrupel': 7 })]);
        expect(problems().map(([code]) => code)).to.deep.equal(['unknown-function']);
        await bootWith([arithmetic, ...calculator({ $include: ['arithmetik'], $in: 1 })]);
        expect(problems().map(([code]) => code)).to.deep.equal(['unknown-module']);
    });

    it('check the mapping of a function that has a signature against it', async () => {
        const typed = body => [library('typed', { functions: { $label: body }, signatures: { $label: { input: { amount: 'integer' }, output: 'string' } } })];
        await bootWith(typed({ $str: ['#.amount'] }));
        expect(problems()).to.deep.equal([]);
        await bootWith(typed({ $str: ['#.amout'] }));
        expect(problems()).to.deep.equal([['unknown-path', 'functions.$label.$str[0]']]);
        await bootWith(typed({ $multiply: ['#.amount', 2] }));
        expect(problems().map(([code]) => code)).to.include('type-mismatch');
    });

    it('report a source the language refuses: an export or a signature without a function, a function named like a primitive', async () => {
        await bootWith([library('broken', { functions: { $one: 1 }, exports: ['$two'] })]);
        expect(problems().map(([code]) => code)).to.deep.equal(['unknown-export']);
        await bootWith([library('careless', { functions: { $map: 1 } })]);
        expect(problems().map(([code]) => code)).to.deep.equal(['reserved-function']);
        await bootWith([library('unsigned', { functions: { $one: 1 }, signatures: { $two: { input: 'integer', output: 'integer' } } })]);
        expect(problems().map(([code]) => code)).to.deep.equal(['unknown-signature']);
    });

    it('make an unscoped name two libraries export ambiguous only where it is called', async () => {
        const other = library('other', { functions: { $double: { $multiply: ['#', 3] } } });
        const both = library('both', { functions: { $double: { $multiply: ['#', 2] } } });
        await bootWith([other, both]);
        expect(run({ $include: ['other', 'both'], $in: { '$other/double': 2 } })).to.equal(6);
        expect(() => run({ $include: ['other', 'both'], $in: { $double: 2 } })).to.throw().with.property('code', 'ambiguous-function');
    });

    it('are called by the code of a pipeline the executor runs', async () => {
        await bootWith([arithmetic, ...runner([{ outputKey: 'twelve', set: { '$arithmetic/quadruple': 3 } }, { set: { $include: ['arithmetic'], $in: { $quadruple: '#.twelve' } } }])]);
        expect(await invoke('the-runner', 'run', null)).to.equal(48);
    });

    it('are found by bpf refs, from a qualified call and from an $include', async () => {
        await bootWith([arithmetic, ...calculator({ $include: ['arithmetic'], $in: { '$arithmetic/text': 1 } })]);
        const { referencesOf } = await import('../src/analysis/introspection.js');
        const { findElement } = await import('../src/registry.js');
        expect(referencesOf(findElement('the-calculator')).filter(({ to }) => to === 'arithmetic').map(({ via }) => via)).to.deep.equal(['library', 'library']);
    });
});
