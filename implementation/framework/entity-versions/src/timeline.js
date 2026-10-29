import { CoreError } from '@business-framework/core';
import { isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { applyAll, compare } from '@business-framework/entities/patch';
import { traitsOf } from '@business-framework/entities/traits';

const invalid = message => new CoreError('invalid', message);

const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

const checkedDate = value => {
    if (!isDate(value)) throw invalid(`'${value}' is not a date YYYY-MM-DD`);
    return value;
};

const sortedKeys = timeline => Object.keys(timeline).sort();

const lastKey = timeline => Object.keys(timeline).reduce((last, key) => key > last ? key : last);

const without = (timeline, key) => Object.fromEntries(Object.entries(timeline).filter(([other]) => other !== key));

const previousKey = (timeline, key) => sortedKeys(timeline).filter(other => other < key).at(-1);

export const startTimeline = ({ validFrom, data }) => ({ [checkedDate(validFrom)]: data });

export const putSegment = ({ timeline, validFrom, data }) => {
    checkedDate(validFrom);
    const last = lastKey(timeline);
    if (validFrom < last) throw invalid(`validFrom ${validFrom} is before the last version ${last}`);
    const replaced = validFrom === last;
    const anchor = replaced ? previousKey(timeline, last) : last;
    return anchor === undefined
        ? { [validFrom]: data }
        : { ...timeline, [anchor]: compare(data, replaced ? applyAll(timeline[last], [timeline[anchor]]) : timeline[last]), [validFrom]: data };
};

export const removeSegment = ({ timeline, validFrom }) => {
    const last = lastKey(timeline);
    if (validFrom !== last) throw new CoreError('conflict', `${validFrom} is not the last version ${last}`);
    const anchor = previousKey(timeline, last);
    if (anchor === undefined) throw invalid(`the only version ${last} can't be removed`);
    return { ...without(timeline, last), [anchor]: applyAll(timeline[last], [timeline[anchor]]) };
};

export const resolveSegment = ({ timeline, at }) => {
    const keys = sortedKeys(timeline);
    const found = at === undefined ? keys.length - 1 : keys.findLastIndex(key => key <= checkedDate(at));
    if (found < 0) throw new CoreError('not-found', `no version is valid at ${at}`);
    const patches = keys.slice(found, -1).reverse().map(key => timeline[key]);
    return { validFrom: keys[found], data: applyAll(timeline[keys.at(-1)], patches) };
};

export const segmentSchemas = () => selvesOf('entity-type').flatMap(({ id }) => Object.entries(traitsOf(id))
    .filter(([, { trait }]) => isInstanceOf({ element: trait, kind: 'versions-trait' }))
    .map(([key, { configuration }]) => ({ id: `${id}/${key}/segment`, schema: configuration.schema })));

export const isVersionable = ({ entityType, key }) => {
    const use = traitsOf(entityType)[key];
    return use !== undefined && isInstanceOf({ element: use.trait, kind: 'versions-trait' });
};
