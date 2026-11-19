import { errorTypeOf, isKindOfError } from '@business-framework/core/error-types';
import { slotValues } from '@business-framework/core/slots';
import { applyMapping } from '@business-framework/core/mappings';

export const rolesOf = ({ entities, tasks = {} }) => ({
    ...entities,
    ...Object.fromEntries(Object.entries(tasks).map(([name, { type }]) => [name, { entityType: type, late: true, task: true }]))
});

const evaluated = (mapping, scope) => applyMapping({ mapping, input: scope });

const catchesError = error => entry => !errorTypeOf(error.code).transient && entry.catches.some(code => isKindOfError(error.code, code));

export const processErrorExit = ({ name, step, scope, error, bindings }) => {
    const entry = (step.onError ?? []).find(catchesError(error));
    if (entry === undefined) throw error;
    const failure = { code: error.code, message: error.message, data: error.data };
    return {
        kind: 'next',
        step: entry.then,
        entities: bindings,
        variables: { ...scope.process.data.body, ...entry.set === undefined ? {} : evaluated(entry.set, { ...scope, error: failure }) },
        recovered: name
    };
};

export const extensionsOf = definition => slotValues({ element: definition, slot: 'stepExtensions' });
