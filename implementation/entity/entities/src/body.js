import { traitValueOf } from './traits.js';

export const bodyOf = record => traitValueOf({ record, kind: 'body-trait' });
