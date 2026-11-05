import { expect } from 'chai';
import { UNDATED, appendVersion, datedBody, patchedBody, removeVersion, replaceVersions, resolveVersion, startVersions } from '../src/versions.js';

const configuration = { versioned: { validFrom: '/startDate' } };

const codeOf = run => {
    try {
        run();
        return null;
    } catch (error) {
        return error.code;
    }
};

const contract = (startDate, premium) => ({ ...(startDate && { startDate }), premium, currency: 'EUR' });

const set = changes => Object.entries(changes).map(([key, value]) => ({ op: 'add', path: `/${key}`, value }));

const amended = ({ timeline, validFrom, patch }) => datedBody({ configuration, validFrom, body: patchedBody({ body: resolveVersion({ timeline }).data, patch }) });

const amend = (timeline, validFrom, changes, ref = 'a-1') => appendVersion({ timeline, validFrom, ref, body: amended({ timeline, validFrom, patch: set(changes) }) });

describe('versions', () => {
    const first = startVersions({ configuration, body: contract('2025-01-01', 100) });
    const timeline = amend(amend(first, '2025-07-01', { premium: 110 }), '2026-03-01', { premium: 120 });

    it('keys a version by the date the body holds at the pointer', () => {
        expect(first).to.deep.equal([{ validFrom: '2025-01-01', body: contract('2025-01-01', 100) }]);
    });

    it('stores the last version in full and earlier ones as backward patches', () => {
        expect(timeline.map(({ validFrom }) => validFrom)).to.deep.equal(['2025-01-01', '2025-07-01', '2026-03-01']);
        expect(timeline.at(-1).body).to.deep.equal(contract('2026-03-01', 120));
        expect(timeline.slice(0, -1).map(({ body }) => body)).to.satisfy(patches => patches.every(Array.isArray));
    });

    it('sets the date of an amended version in its body, keeping the rest', () => {
        expect(amended({ timeline, configuration, validFrom: '2027-01-01', patch: set({ premium: 1 }) })).to.deep.equal(contract('2027-01-01', 1));
    });

    it('transforms the last version by any JSON Patch, and refuses one that does not apply', () => {
        const nested = startVersions({ configuration, body: { startDate: '2025-01-01', cover: { fire: 1, flood: 2 }, tags: ['a'] } });
        const patch = [{ op: 'remove', path: '/cover/flood' }, { op: 'copy', from: '/cover/fire', path: '/cover/storm' }, { op: 'move', from: '/tags', path: '/labels' }, { op: 'test', path: '/cover/fire', value: 1 }];
        expect(amended({ timeline: nested, configuration, validFrom: '2026-01-01', patch })).to.deep.equal({ startDate: '2026-01-01', cover: { fire: 1, storm: 1 }, labels: ['a'] });
        expect([[{ op: 'remove', path: '/nothing' }], [{ op: 'test', path: '/cover/fire', value: 2 }], [{ op: 'jump' }], { cover: 1 }]
            .map(bad => codeOf(() => amended({ timeline: nested, configuration, validFrom: '2026-01-01', patch: bad })))).to.deep.equal(['invalid', 'invalid', 'invalid', 'invalid']);
    });

    it('resolves the version valid at a date, the last without one', () => {
        expect(resolveVersion({ timeline })).to.deep.equal({ validFrom: '2026-03-01', data: contract('2026-03-01', 120) });
        expect(resolveVersion({ timeline, at: '2025-12-31' })).to.deep.equal({ validFrom: '2025-07-01', data: contract('2025-07-01', 110) });
        expect(resolveVersion({ timeline, at: '2025-01-01' }).data.premium).to.equal(100);
        expect(resolveVersion({ timeline, at: '2030-01-01' }).validFrom).to.equal('2026-03-01');
        expect(codeOf(() => resolveVersion({ timeline, at: '2024-12-31' }))).to.equal('not-found');
    });

    it('keeps the version of each amendment at the same date, the later one shadowing the earlier', () => {
        const twice = amend(timeline, '2026-03-01', { premium: 130 }, 'a-2');
        expect(twice.map(({ validFrom }) => validFrom)).to.deep.equal(['2025-01-01', '2025-07-01', '2026-03-01', '2026-03-01']);
        expect(resolveVersion({ timeline: twice }).data).to.deep.equal(contract('2026-03-01', 130));
        expect(resolveVersion({ timeline: twice, at: '2025-12-31' }).data).to.deep.equal(contract('2025-07-01', 110));
        expect(resolveVersion({ timeline: twice, at: '2025-03-01' }).data).to.deep.equal(contract('2025-01-01', 100));
    });

    it('restores the version of the first amendment when the second at the same date is removed', () => {
        const restored = removeVersion({ timeline: amend(timeline, '2026-03-01', { premium: 130 }, 'a-2'), validFrom: '2026-03-01', ref: 'a-2' });
        expect(restored).to.deep.equal(timeline);
        expect(restored.at(-1).ref).to.equal('a-1');
        expect(resolveVersion({ timeline: restored }).data).to.deep.equal(contract('2026-03-01', 120));
    });

    it('refuses an amendment before the last version, and dates that do not exist', () => {
        expect(['2026-02-28', '2025-01-01'].map(validFrom => codeOf(() => amend(timeline, validFrom, {})))).to.deep.equal(['conflict', 'conflict']);
        expect(['2026-04-31', '2026-4-1', 'soon'].map(validFrom => codeOf(() => amend(timeline, validFrom, {})))).to.deep.equal(['invalid', 'invalid', 'invalid']);
    });

    it('removes the last version only, restoring the previous one in full', () => {
        const removed = removeVersion({ timeline, validFrom: '2026-03-01', ref: 'a-1' });
        expect(removed.at(-1)).to.deep.equal({ validFrom: '2025-07-01', ref: 'a-1', body: contract('2025-07-01', 110) });
        expect(removed.map(({ validFrom }) => validFrom)).to.deep.equal(['2025-01-01', '2025-07-01']);
        expect(codeOf(() => removeVersion({ timeline, validFrom: '2025-07-01', ref: 'a-1' }))).to.equal('conflict');
        expect(codeOf(() => removeVersion({ timeline, validFrom: '2026-03-01', ref: 'a-2' }))).to.equal('conflict');
        expect(codeOf(() => removeVersion({ timeline: first, validFrom: '2025-01-01' }))).to.equal('invalid');
    });

    it('undoes an amendment with a remove', () => {
        expect(resolveVersion({ timeline: removeVersion({ timeline: amend(first, '2026-01-01', { premium: 1 }), validFrom: '2026-01-01', ref: 'a-1' }) }).data).to.deep.equal(contract('2025-01-01', 100));
    });

    it('replaces a body of one version, with another date, and refuses to replace a history', () => {
        expect(replaceVersions({ timeline: first, configuration, body: contract('2025-02-01', 90) })).to.deep.equal([{ validFrom: '2025-02-01', body: contract('2025-02-01', 90) }]);
        expect(codeOf(() => replaceVersions({ timeline, configuration, body: contract('2025-02-01', 90) }))).to.equal('conflict');
    });

    describe('without a date', () => {
        const undated = startVersions({ configuration, body: contract(undefined, 100) });

        it('keys the body with the marker, before every date', () => {
            expect(undated.map(({ validFrom }) => validFrom)).to.deep.equal([UNDATED]);
            expect(resolveVersion({ timeline: undated, at: '1900-01-01' }).data.premium).to.equal(100);
        });

        it('is replaced when a date is given', () => {
            expect(replaceVersions({ timeline: undated, configuration, body: contract('2025-01-01', 100) })).to.deep.equal([{ validFrom: '2025-01-01', body: contract('2025-01-01', 100) }]);
            expect(amend(undated, '2025-01-01', { premium: 90 })).to.deep.equal([{ validFrom: '2025-01-01', ref: 'a-1', body: contract('2025-01-01', 90) }]);
        });

        it('stays before the dated versions once given a version', () => {
            const dated = [...undated, { validFrom: '2025-01-01', body: contract('2025-01-01', 90) }];
            expect(resolveVersion({ timeline: dated, at: '2024-01-01' }).validFrom).to.equal(UNDATED);
            expect(resolveVersion({ timeline: dated }).validFrom).to.equal('2025-01-01');
        });
    });
});
