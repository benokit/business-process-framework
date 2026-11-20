import { isInstanceOf } from '@business-framework/core/kinds';
import { traitsOf } from './traits.js';

export const recordSchema = data => ({
    '!id': 'string',
    '!entityType': 'string',
    '!businessKey': 'string',
    '!revision': 'number',
    '!timestampUtc': 'string',
    '!data': data
});

const traitSchema = ({ trait, configuration }) => isInstanceOf({ element: trait, kind: 'body-trait' }) && configuration.schema !== undefined ? configuration.schema : '@any';

export const recordSchemaOf = ({ entityType }) => recordSchema(Object.fromEntries(Object.entries(traitsOf(entityType)).map(([key, use]) => [key, traitSchema(use)])));
