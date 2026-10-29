import { expect } from 'chai';
import { putSegment, removeSegment, resolveSegment, startTimeline } from '../src/timeline.js';

const codeOf = run => {
    try {
        run();
        return null;
    } catch (error) {
        return error.code;
    }
};

const build = (...segments) => segments.reduce((timeline, [validFrom, data]) => putSegment({ timeline, validFrom, data }), startTimeline({ validFrom: segments[0][0], data: segments[0][1] }));

const contents = timeline => Object.keys(timeline).sort().map(validFrom => resolveSegment({ timeline, at: validFrom }));

describe('timeline', () => {
    const timeline = build(['2025-01-01', { premium: 100 }], ['2025-07-01', { premium: 110 }], ['2026-03-01', { premium: 120, currency: 'EUR' }]);

    it('stores the last segment in full and earlier ones as backward patches', () => {
        expect(timeline['2026-03-01']).to.deep.equal({ premium: 120, currency: 'EUR' });
        expect(timeline['2025-07-01']).to.be.an('array');
        expect(timeline['2025-01-01']).to.be.an('array');
    });

    it('resolves the segment valid at a date, the last without one', () => {
        expect(resolveSegment({ timeline })).to.deep.equal({ validFrom: '2026-03-01', data: { premium: 120, currency: 'EUR' } });
        expect(resolveSegment({ timeline, at: '2025-12-31' })).to.deep.equal({ validFrom: '2025-07-01', data: { premium: 110 } });
        expect(resolveSegment({ timeline, at: '2025-01-01' }).data).to.deep.equal({ premium: 100 });
        expect(resolveSegment({ timeline, at: '2030-01-01' }).validFrom).to.equal('2026-03-01');
        expect(codeOf(() => resolveSegment({ timeline, at: '2024-12-31' }))).to.equal('not-found');
    });

    it('replaces the last segment, keeping every earlier one', () => {
        const replaced = putSegment({ timeline, validFrom: '2026-03-01', data: { premium: 130 } });
        expect(contents(replaced)).to.deep.equal([
            { validFrom: '2025-01-01', data: { premium: 100 } },
            { validFrom: '2025-07-01', data: { premium: 110 } },
            { validFrom: '2026-03-01', data: { premium: 130 } }
        ]);
    });

    it('replaces the only segment', () => {
        expect(putSegment({ timeline: startTimeline({ validFrom: '2025-01-01', data: { a: 1 } }), validFrom: '2025-01-01', data: { a: 2 } })).to.deep.equal({ '2025-01-01': { a: 2 } });
    });

    it('refuses a start before the last one and dates that do not exist', () => {
        expect(codeOf(() => putSegment({ timeline, validFrom: '2026-02-28', data: {} }))).to.equal('invalid');
        expect(['2026-02-30', '2026-3-1', 'soon'].map(validFrom => codeOf(() => putSegment({ timeline, validFrom, data: {} })))).to.deep.equal(['invalid', 'invalid', 'invalid']);
    });

    it('removes the last segment only, restoring the previous one in full', () => {
        const removed = removeSegment({ timeline, validFrom: '2026-03-01' });
        expect(removed['2025-07-01']).to.deep.equal({ premium: 110 });
        expect(contents(removed).map(({ validFrom }) => validFrom)).to.deep.equal(['2025-01-01', '2025-07-01']);
        expect(codeOf(() => removeSegment({ timeline, validFrom: '2025-07-01' }))).to.equal('conflict');
        expect(codeOf(() => removeSegment({ timeline: startTimeline({ validFrom: '2025-01-01', data: {} }), validFrom: '2025-01-01' }))).to.equal('invalid');
    });

    it('undoes a split with a remove', () => {
        const added = putSegment({ timeline, validFrom: '2027-01-01', data: { premium: 1, extra: [1, 2] } });
        expect(removeSegment({ timeline: added, validFrom: '2027-01-01' })).to.deep.equal(timeline);
    });
});
