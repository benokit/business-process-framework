import { expect } from 'chai';
import { dateAdd, dateParse } from '../src/dates.js';
import { invoke, validate } from '../src/index.js';
import { bootWith, element, kind, operation } from './helpers.js';

const failure = run => { try { run(); } catch (error) { return [error.code, error.data.value]; } };

describe('dates', () => {
    it('parses an ISO 8601 instant with a UTC designator, an offset or a date alone to milliseconds', () => {
        expect(dateParse('2030-01-01T10:00:00Z')).to.equal(1893492000000);
        expect(dateParse('2030-01-01T10:00:00.500Z')).to.equal(1893492000500);
        expect(dateParse('2030-01-01T11:00:00+01:00')).to.equal(1893492000000);
        expect(dateParse('2030-01-01')).to.equal(1893456000000);
    });

    it('refuses what is not such an instant, a calendar day that does not exist included, with invalid-date', () => {
        ['nope', '', '2030-01-01T10:00:00', '2030-02-30', '2030-13-01', '2030-01-01T25:00:00Z', null, 1893492000000]
            .forEach(value => expect(failure(() => dateParse(value)), String(value)).to.deep.equal(['invalid-date', value]));
    });

    it('moves an instant by the given amounts, as an ISO string in UTC', () => {
        expect(dateAdd({ date: '2030-01-01T10:00:00Z', days: 1, hours: 2, minutes: 3 })).to.equal('2030-01-02T12:03:00.000Z');
        expect(dateAdd({ date: '2030-01-01T10:00:00Z', hours: -10, seconds: 30, milliseconds: 5 })).to.equal('2030-01-01T00:00:30.005Z');
        expect(dateAdd({ date: '2030-01-01T11:00:00+01:00' })).to.equal('2030-01-01T10:00:00.000Z');
        expect(dateAdd({ date: '2030-12-31', days: 1 })).to.equal('2031-01-01T00:00:00.000Z');
    });

    it('round trips: parsing the moved instant gives the parsed instant plus the amount', () => {
        const date = '2030-01-01T10:00:00Z';
        expect(dateParse(dateAdd({ date, days: 2, minutes: 1.5 }))).to.equal(dateParse(date) + (2 * 24 * 60 + 1.5) * 60000);
    });

    it('is available to mappings as $func/date-add and $func/date-parse, with their types checked', async () => {
        await bootWith(
            kind('scheduler', {
                operations: {
                    due: operation({ set: { '$func/date-parse': { '$func/date-add': { date: '#.input.now', days: '#.input.days' } } } }, { '!now': 'string', '!days': 'number' }),
                    mistyped: operation({ set: { '$func/date-add': { date: '#.input.now', days: 'one' } } }, { '!now': 'string' })
                }
            }),
            element('the-scheduler', 'scheduler'));
        expect(await invoke('the-scheduler', 'due', { now: '2030-01-01T00:00:00Z', days: 1 })).to.equal(1893542400000);
        expect(validate().map(problem => [problem.code, problem.data.element])).to.deep.equal([['type-mismatch', 'scheduler']]);
    });
});
