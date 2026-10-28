import { expect } from 'chai';
import { renderTrace } from '@business-framework/tools';

const span = (label, children = [], rest = {}) => ({ label, children, ...rest });

const outcome = {
    error: { code: 'conflict', message: 'no' },
    spans: [span('orders.update', [
        span('step 1 invoke', [span('orders.read', [span('step 1 low', [span('low execute', [], { effects: ['read'] })])])]),
        span('step 2 invoke', [span('orders.applyChange', [span('only-in-draft', [span('step 1 throw', [], { error: 'conflict' })], { error: 'conflict' })], { error: 'conflict' })], { error: 'conflict' })
    ], { error: 'conflict' })]
};

describe('trace rendering', () => {
    it('shows the elements an operation passes, low nodes with their effects, and the step that failed', () => {
        expect(renderTrace(outcome)).to.equal([
            'orders.update  failed: conflict',
            '  orders.read',
            '    low execute  [read]',
            '  orders.applyChange  failed: conflict',
            '    only-in-draft  failed: conflict',
            '      step 1 throw  failed: conflict',
            '=> conflict: no'
        ].join('\n'));
    });

    it('shows every step on request', () => {
        expect(renderTrace(outcome, { steps: true })).to.include('  step 1 invoke\n    orders.read');
    });
});
