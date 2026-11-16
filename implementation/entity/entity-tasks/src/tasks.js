import { isInstanceOf, selvesOf } from '@business-framework/core/kinds';
import { traitsOf } from '@business-framework/entities/traits';

const hasSchema = outcome => outcome !== true && typeof outcome?.answer === 'object';

export const outcomeSchemas = () => selvesOf('entity-type').flatMap(({ id }) => Object.entries(traitsOf(id))
    .filter(([, { trait }]) => isInstanceOf({ element: trait, kind: 'task-trait' }))
    .flatMap(([key, { configuration }]) => Object.entries(configuration.outcomes)
        .filter(([, outcome]) => hasSchema(outcome))
        .map(([name, outcome]) => ({ id: `${id}/${key}/outcome/${name}`, schema: outcome.answer }))));

export const taskRelations = record => record.data.task?.status === 'open'
    ? (record.data.task.about ?? []).map(({ entityType, businessKey }) => ({ targetEntityType: entityType, targetEntityBusinessKey: businessKey, relationType: 'about' }))
    : [];

export const searchDocument = record => ({
    entityType: record.entityType,
    status: record.data.task.status,
    actor: record.data.task.actor ?? null,
    assignedTo: record.data.task.assignedTo ?? null,
    dueOn: record.data.task.dueOn === undefined ? null : Date.parse(record.data.task.dueOn),
    outcome: record.data.task.outcome ?? null,
    about: (record.data.task.about ?? []).map(({ entityType, businessKey }) => `${entityType}/${businessKey}`)
});
