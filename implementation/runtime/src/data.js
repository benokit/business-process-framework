import { isArray, isPlainObject, mapValues, merge } from 'lodash-es';
import { getElement } from './elements-registry.js';

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
            return evaluateData(getElement(data[keyword.ref]).data);
        }

        if (data[keyword.merge]) {
            return merge({}, ...(data[keyword.merge].map(evaluateData)));
        }

        return mapValues(data, evaluateData);
    }
}

export {
    evaluateData
};
