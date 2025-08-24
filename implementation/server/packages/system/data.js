const { isArray, isPlainObject, mapValues, merge } = require('lodash');
const { getObject } = require('system/objects-registry');

const dataCache = {};

function getData(dataId) {

    if (dataCache[dataId]) {
        return dataCache[dataId];
    }

    const object = getObject('data', dataId);

    if (!object) {
        return null;
    }

    const evaluatedData = evaluateData(object.data)

    dataCache[dataId] = evaluatedData;

    return evaluatedData;
}

const keyword = {
    literal: '$literal',
    ref: '$ref',
    merge: '$merge'
}

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
            return getData(data[keyword.ref]) || data;
        }

        if (data[keyword.merge]) {
            return merge({}, ...(data[keyword.merge].map(evaluateData)));
        }

        return mapValues(data, evaluateData);
    }
}

module.exports = {
    getData,
    evaluateData
}