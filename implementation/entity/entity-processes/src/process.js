import { slotValues } from '@business-framework/core/slots';

export const rolesOf = ({ entities, tasks = {} }) => ({
    ...entities,
    ...Object.fromEntries(Object.entries(tasks).map(([name, { type }]) => [name, { entityType: type, late: true, task: true }]))
});

export const extensionsOf = definition => slotValues({ element: definition, slot: 'stepExtensions' });
