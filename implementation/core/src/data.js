import { isArray, isPlainObject, mapValues, merge } from 'lodash-es';
import { getElement } from './elements-registry.js';

const dataCache = {};

function getData(dataId) {

    if (dataCache[dataId]) {
        return dataCache[dataId];
    }

    const element = getElement('data', dataId);

    if (!element) {
        return;
    }

    const evaluatedData = { ...element, data: evaluateData(element.data) }

    dataCache[dataId] = evaluatedData;

    return evaluatedData;
}

const keyword = {
    literal: '/literal',
    ref: '/ref',
    merge: '/merge'
};

function evaluateData(data) {
    if (!isArray(data) && !isPlainObject(data)) {
        return data;
    }

    if (isArray(data)) {
        return data.map(evaluateData)
    }

    if (isPlainObject(data)) {
        if (data[keyword.literal]) {
            return data[keyword.literal];
        }

        if (data[keyword.ref]) {
            return getData(data[keyword.ref]).data;
        }

        if (data[keyword.merge]) {
            return merge({}, ...(data[keyword.merge].map(evaluateData)));
        }

        return mapValues(data, evaluateData);
    }
}

export {
    getData,
    evaluateData
};
