import { isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { traitsOf } from './traits.js';

export const bodySchemas = () => selvesOf('entity-type').flatMap(({ id }) => Object.entries(traitsOf(id))
    .filter(([, { trait, configuration }]) => isInstanceOf({ element: trait, kind: 'body-trait' }) && configuration.schema !== undefined)
    .map(([key, { configuration }]) => ({ id: `${id}/${key}/schema`, schema: configuration.schema })));
