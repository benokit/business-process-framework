import { expect } from 'chai';
import { UNDATED, amendedBody, appendVersion, removeVersion, replaceVersions, resolveVersion, startVersions } from '../src/versions.js';

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

const amend = (timeline, validFrom, changes) => appendVersion({ timeline, validFrom, body: amendedBody({ timeline, configuration, validFrom, patch: set(changes) }) });

describe('versions', () => {
    const first = startVersions({ configuration, body: contract('2025-01-01', 100) });
    const timeline = amend(amend(first, '2025-07-01', { premium: 110 }), '2026-03-01', { premium: 120 });

    it('keys a version by the date the body holds at the pointer', () => {
        expect(first).to.deep.equal({ '2025-01-01': contract('2025-01-01', 100) });
    });

    it('stores the last version in full and earlier ones as backward patches', () => {
        expect(timeline['2026-03-01']).to.deep.equal(contract('2026-03-01', 120));
        expect(timeline['2025-07-01']).to.be.an('array');
        expect(timeline['2025-01-01']).to.be.an('array');
    });

    it('sets the date of an amended version in its body, keeping the rest', () => {
        expect(amendedBody({ timeline, configuration, validFrom: '2027-01-01', patch: set({ premium: 1 }) })).to.deep.equal(contract('2027-01-01', 1));
    });

    it('transforms the last version by any JSON Patch, and refuses one that does not apply', () => {
        const nested = startVersions({ configuration, body: { startDate: '2025-01-01', cover: { fire: 1, flood: 2 }, tags: ['a'] } });
        const patch = [{ op: 'remove', path: '/cover/flood' }, { op: 'copy', from: '/cover/fire', path: '/cover/storm' }, { op: 'move', from: '/tags', path: '/labels' }, { op: 'test', path: '/cover/fire', value: 1 }];
        expect(amendedBody({ timeline: nested, configuration, validFrom: '2026-01-01', patch })).to.deep.equal({ startDate: '2026-01-01', cover: { fire: 1, storm: 1 }, labels: ['a'] });
        expect([[{ op: 'remove', path: '/nothing' }], [{ op: 'test', path: '/cover/fire', value: 2 }], [{ op: 'jump' }], { cover: 1 }]
            .map(bad => codeOf(() => amendedBody({ timeline: nested, configuration, validFrom: '2026-01-01', patch: bad })))).to.deep.equal(['invalid', 'invalid', 'invalid', 'invalid']);
    });

    it('resolves the version valid at a date, the last without one', () => {
        expect(resolveVersion({ timeline })).to.deep.equal({ validFrom: '2026-03-01', data: contract('2026-03-01', 120) });
        expect(resolveVersion({ timeline, at: '2025-12-31' })).to.deep.equal({ validFrom: '2025-07-01', data: contract('2025-07-01', 110) });
        expect(resolveVersion({ timeline, at: '2025-01-01' }).data.premium).to.equal(100);
        expect(resolveVersion({ timeline, at: '2030-01-01' }).validFrom).to.equal('2026-03-01');
        expect(codeOf(() => resolveVersion({ timeline, at: '2024-12-31' }))).to.equal('not-found');
    });

    it('replaces the last version by an amendment at its date, keeping every earlier one', () => {
        const replaced = amend(timeline, '2026-03-01', { premium: 130 });
        expect(Object.keys(replaced).sort()).to.deep.equal(['2025-01-01', '2025-07-01', '2026-03-01']);
        expect(resolveVersion({ timeline: replaced }).data).to.deep.equal(contract('2026-03-01', 130));
        expect(resolveVersion({ timeline: replaced, at: '2025-12-31' }).data).to.deep.equal(contract('2025-07-01', 110));
        expect(resolveVersion({ timeline: replaced, at: '2025-03-01' }).data).to.deep.equal(contract('2025-01-01', 100));
        expect(amend(first, '2025-01-01', { premium: 90 })).to.deep.equal({ '2025-01-01': contract('2025-01-01', 90) });
    });

    it('refuses an amendment before the last version, and dates that do not exist', () => {
        expect(['2026-02-28', '2025-01-01'].map(validFrom => codeOf(() => amend(timeline, validFrom, {})))).to.deep.equal(['conflict', 'conflict']);
        expect(['2026-04-31', '2026-4-1', 'soon'].map(validFrom => codeOf(() => amend(timeline, validFrom, {})))).to.deep.equal(['invalid', 'invalid', 'invalid']);
    });

    it('removes the last version only, restoring the previous one in full', () => {
        const removed = removeVersion({ timeline, validFrom: '2026-03-01' });
        expect(removed['2025-07-01']).to.deep.equal(contract('2025-07-01', 110));
        expect(Object.keys(removed).sort()).to.deep.equal(['2025-01-01', '2025-07-01']);
        expect(codeOf(() => removeVersion({ timeline, validFrom: '2025-07-01' }))).to.equal('conflict');
        expect(codeOf(() => removeVersion({ timeline: first, validFrom: '2025-01-01' }))).to.equal('invalid');
    });

    it('undoes an amendment with a remove', () => {
        expect(resolveVersion({ timeline: removeVersion({ timeline: amend(first, '2026-01-01', { premium: 1 }), validFrom: '2026-01-01' }) }).data).to.deep.equal(contract('2025-01-01', 100));
    });

    it('replaces a body of one version, with another date, and refuses to replace a history', () => {
        expect(replaceVersions({ timeline: first, configuration, body: contract('2025-02-01', 90) })).to.deep.equal({ '2025-02-01': contract('2025-02-01', 90) });
        expect(codeOf(() => replaceVersions({ timeline, configuration, body: contract('2025-02-01', 90) }))).to.equal('conflict');
    });

    describe('without a date', () => {
        const undated = startVersions({ configuration, body: contract(undefined, 100) });

        it('keys the body with the marker, before every date', () => {
            expect(Object.keys(undated)).to.deep.equal([UNDATED]);
            expect(resolveVersion({ timeline: undated, at: '1900-01-01' }).data.premium).to.equal(100);
        });

        it('is replaced when a date is given', () => {
            expect(replaceVersions({ timeline: undated, configuration, body: contract('2025-01-01', 100) })).to.deep.equal({ '2025-01-01': contract('2025-01-01', 100) });
            expect(amend(undated, '2025-01-01', { premium: 90 })).to.deep.equal({ '2025-01-01': contract('2025-01-01', 90) });
        });

        it('stays before the dated versions once given a version', () => {
            const dated = { ...undated, ...{ '2025-01-01': contract('2025-01-01', 90) } };
            expect(resolveVersion({ timeline: dated, at: '2024-01-01' }).validFrom).to.equal(UNDATED);
            expect(resolveVersion({ timeline: dated }).validFrom).to.equal('2025-01-01');
        });
    });
});
