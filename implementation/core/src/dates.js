import { CoreError } from './errors.js';

const INSTANT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

const MILLISECONDS = { days: 24 * 60 * 60 * 1000, hours: 60 * 60 * 1000, minutes: 60 * 1000, seconds: 1000, milliseconds: 1 };

const isCalendarDate = instant => {
    const [year, month, day] = instant.slice(0, 10).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const invalid = instant => new CoreError('invalid-date', `'${instant}' is not an ISO 8601 instant with a UTC designator or an offset`, { value: instant });

export const dateParse = instant => {
    const milliseconds = typeof instant === 'string' && INSTANT.test(instant) && isCalendarDate(instant) ? Date.parse(instant) : NaN;
    if (Number.isNaN(milliseconds)) throw invalid(instant);
    return milliseconds;
};

export const dateAdd = ({ date, ...amounts }) => new Date(Object.entries(amounts)
    .reduce((total, [unit, amount]) => total + amount * MILLISECONDS[unit], dateParse(date))).toISOString();
