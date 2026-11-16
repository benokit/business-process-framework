import { isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { traitsOf } from '@business-framework/entities/traits';

const hasSchema = outcome => outcome !== true && typeof outcome?.answer === 'object';

export const outcomeSchemas = () => selvesOf('entity-type').flatMap(({ id }) => Object.entries(traitsOf(id))
    .filter(([, { trait }]) => isInstanceOf({ element: trait, kind: 'task-trait' }))
    .flatMap(([key, { configuration }]) => Object.entries(configuration.outcomes)
        .filter(([, outcome]) => hasSchema(outcome))
        .map(([name, outcome]) => ({ id: `${id}/${key}/outcome/${name}`, schema: outcome.answer }))));
