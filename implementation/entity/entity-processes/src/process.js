import { CoreError, invoke } from '@business-framework/core';
import { errorTypeOf, isKindOfError } from '@business-framework/core/error-types';
import { selvesOf } from '@business-framework/core/kinds';
import { applyMapping } from '@business-framework/core/mappings';
import { memo } from '@business-framework/core/registry';
import { isDeepStrictEqual } from 'node:util';

const definitionOf = id => selvesOf('process-definition').find(element => element.id === id).data;

const bindingOf = ({ entityType, many }) => businessKeys => many
    ? [businessKeys].flat().map(businessKey => ({ entityType, businessKey }))
    : { entityType, businessKey: businessKeys };

const unbound = (roles, entities) => Object.entries(roles).filter(([role, { late }]) => !late && entities[role] === undefined).map(([role]) => role);

const lateBound = (roles, entities) => Object.entries(roles).filter(([role, { late }]) => late && entities[role] !== undefined).map(([role]) => role);

const unknown = (roles, entities) => Object.keys(entities).filter(role => roles[role] === undefined);

export const initialProcessValue = ({ definition, entities }) => {
    const { entities: roles, start } = definitionOf(definition);
    const refused = [
        ...unbound(roles, entities).map(role => `the role '${role}' must be bound to start ${definition}`),
        ...lateBound(roles, entities).map(role => `the role '${role}' is late: a step binds it, not the start`),
        ...unknown(roles, entities).map(role => `${definition} has no role '${role}'`)
    ];
    if (refused.length > 0) throw new CoreError('invalid', refused.join('; '), { definition });
    return {
        definition,
        step: start,
        entities: Object.fromEntries(Object.entries(entities).map(([role, businessKeys]) => [role, bindingOf(roles[role])(businessKeys)]))
    };
};

const boundBy = (definition, roles, role, current, businessKeys) => {
    const declared = roles[role] ?? (() => { throw new CoreError('invalid', `${definition} has no role '${role}'`, { definition, role }); })();
    if (!declared.late) throw new CoreError('conflict', `the role '${role}' is bound at the start and never rebound`, { definition, role });
    if (!declared.many && current !== undefined) throw new CoreError('conflict', `the role '${role}' is already bound`, { definition, role });
    return declared.many ? [...current ?? [], ...bindingOf(declared)(businessKeys)] : bindingOf(declared)(businessKeys);
};

const bindingsAfter = (definition, bindings, bind = {}) => Object.entries(bind)
    .reduce((current, [role, businessKeys]) => ({ ...current, [role]: boundBy(definition, definitionOf(definition).entities, role, current[role], businessKeys) }), bindings);

export const processStepOf = ({ definition, step }) => definitionOf(definition).steps[step];

const evaluated = (mapping, scope) => applyMapping({ mapping, input: scope });

const targetOf = (name, choose, scope) => choose.find(([test]) => test === 'else' || evaluated(test, scope))?.[1]
    ?? (() => { throw new CoreError('invalid', `no choose entry of the step '${name}' holds`, { step: name }); })();

const untilOf = (until, scope) => ({
    then: until.then,
    ...until.at === undefined ? { after: until.after } : { at: evaluated(until.at, scope) }
});

const waitOf = (wait, scope, revision) => ({
    token: revision + 1,
    signals: Object.keys(wait.signals ?? {}),
    ...wait.until === undefined ? {} : { until: untilOf(wait.until, scope) }
});

const exitOf = (name, step, scope, revision) => step.end
    ? { kind: 'end' }
    : step.next !== undefined
        ? { kind: 'next', step: step.next }
        : step.choose !== undefined
            ? { kind: 'next', step: targetOf(name, step.choose, scope) }
            : { kind: 'wait', wait: waitOf(step.wait, scope, revision) };

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

const withVariables = (scope, variables) => ({ ...scope, process: { ...scope.process, data: { ...scope.process.data, body: variables } } });

export const processExit = ({ name, step, scope, revision, bindings }) => {
    const variables = { ...scope.process.data.body, ...step.set === undefined ? {} : evaluated(step.set, scope) };
    const entities = bindingsAfter(scope.process.data.process.definition, bindings, scope.output?.bind);
    return { variables, entities, ...exitOf(name, step, withVariables(scope, variables), revision) };
};

const sequentially = (items, run) => items.reduce(async (done, item) => [...await done, await run(item)], Promise.resolve([]));

const readerOf = _ctx => ({ entityType, businessKey }) => invoke(entityType, 'read', { businessKey }, _ctx);

export const loadParticipants = async ({ input: bindings, _ctx }) => Object.fromEntries(await sequentially(
    Object.entries(bindings),
    async ([role, binding]) => [role, Array.isArray(binding) ? await sequentially(binding, readerOf(_ctx)) : await readerOf(_ctx)(binding)]));

const MINUTE = 60 * 1000;

const durationInMilliseconds = ({ days = 0, hours = 0, minutes = 0 }) => ((days * 24 + hours) * 60 + minutes) * MINUTE;

export const resolvedWait = ({ wait, now }) => wait.until === undefined || wait.until.at !== undefined
    ? wait
    : { ...wait, until: { at: new Date(Date.parse(now) + durationInMilliseconds(wait.until.after)).toISOString(), then: wait.until.then } };

export const heldExit = ({ step, exit, entities, scope }) => {
    const held = exit.kind === 'wait' && entities !== undefined
        ? (step.wait.when ?? []).find(({ test }) => evaluated(test, { ...scope, entities }))
        : undefined;
    return held === undefined ? exit : { kind: 'next', step: held.then, variables: exit.variables, entities: exit.entities };
};

const stepsOf = ({ definition }) => definitionOf(definition).steps;

const signalTarget = (process, { name, payload }) => process.data.process.wait?.signals.includes(name)
    ? { step: stepsOf(process.data.process)[process.data.process.step].wait.signals[name].to, signal: payload ?? null }
    : null;

const timerTarget = (process, { token, step }) => process.data.process.wait?.token === token && process.data.process.wait.until?.then === step
    ? { step, signal: null }
    : null;

const checkTarget = (process, entities) => {
    const position = process.data.process;
    const held = position.wait === undefined
        ? undefined
        : (stepsOf(position)[position.step].wait.when ?? []).find(({ test }) => evaluated(test, { process, entities }));
    return held === undefined ? null : { step: held.then, signal: null };
};

const targetOfKind = { signal: signalTarget, timer: timerTarget, check: (process, { entities }) => checkTarget(process, entities) };

export const wakeupTarget = ({ process, wakeup, entities }) => process.data.state.status !== 'running'
    ? null
    : targetOfKind[wakeup.kind](process, { ...wakeup, entities });

export const processPosition = ({ process, step, wait, entities }) => ({
    definition: process.definition,
    step,
    entities: entities ?? process.entities,
    ...wait === undefined || wait === null ? {} : { wait }
});

const moved = process => ({ key: 'process', operation: 'move', input: { process } });

const transition = name => ({ key: 'state', operation: 'transition', input: { transition: name } });

export const processVerdict = ({ process, wakeup, error, attempts }) => {
    const { transient, outage } = errorTypeOf(error.code);
    if (outage || wakeup.kind === 'start') return { action: 'rethrow', operations: [] };
    if (process.data.state.status !== 'running') return { action: 'drop', operations: [] };
    const position = process.data.process;
    const step = wakeupTarget({ process, wakeup })?.step ?? position.step;
    const count = (position.failures?.step === step ? position.failures.count : 0) + 1;
    return !transient || count >= attempts
        ? { action: 'suspend', operations: [moved({ ...position, fault: { step, code: error.code, message: error.message, attempts: count, wakeup } }), transition('suspend')] }
        : { action: 'count', operations: [moved({ ...position, failures: { step, count } })] };
};

const FINISHED = ['ended', 'aborted'];

export const processRelations = record => FINISHED.includes(record.data.state.status)
    ? []
    : Object.entries(record.data.process.entities).flatMap(([role, binding]) => [binding].flat()
        .map(({ entityType, businessKey }) => ({ targetEntityType: entityType, targetEntityBusinessKey: businessKey, relationType: role })));

const isBound = (bindings, { entityType, businessKey }) => Object.values(bindings).flatMap(binding => [binding].flat())
    .some(bound => bound.entityType === entityType && bound.businessKey === businessKey);

export const footprintAllows = ({ process, change, entityType }) => change.operation === 'create'
    ? Object.values(definitionOf(process.definition).entities).some(role => role.entityType === entityType)
    : isBound(process.entities, change.before);

const ENTITY_PATH = /^#\.entities\.([^.]+)(?:\.(.*))?$/;

const readsOf = value => typeof value === 'string'
    ? [value.match(ENTITY_PATH)].filter(Boolean).map(([, role, path]) => ({ role, path }))
    : typeof value === 'object' && value !== null ? Object.values(value).flatMap(readsOf) : [];

const conditionsOf = ({ steps }) => Object.values(steps).flatMap(step => step.wait?.when ?? []);

const pathsOf = (reads, many) => many || reads.some(({ path }) => path === undefined) ? null : [...new Set(reads.map(({ path }) => path))];

const viewsOf = memo(entityType => selvesOf('process-definition').flatMap(({ id, data }) => Object.entries(data.entities)
    .filter(([, role]) => role.entityType === entityType)
    .map(([role, { many }]) => ({ name: `${id}/${role}`, reads: conditionsOf(data).flatMap(({ test }) => readsOf(test)).filter(read => read.role === role), many }))
    .filter(({ reads }) => reads.length > 0)
    .map(({ name, reads, many }) => ({ name, paths: pathsOf(reads, many) }))));

const at = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

const viewed = (paths, record) => paths === null ? record?.data : paths.map(path => at(record, path));

export const changedViews = ({ entityType, before, after }) => {
    const names = viewsOf(entityType)
        .filter(({ paths }) => !isDeepStrictEqual(viewed(paths, before), viewed(paths, after)))
        .map(({ name }) => name);
    return names.length === 0 ? null : names;
};

export const viewRoles = ({ changed }) => changed.map(name => ({ definition: name.slice(0, name.indexOf('/')), role: name.slice(name.indexOf('/') + 1) }));

export const processChecks = ({ message, view, sources }) => {
    const types = selvesOf('process-entity-type').filter(({ data }) => data.definition === view.definition).map(({ id }) => id);
    return sources
        .filter(({ sourceEntityType, sourceEntityBusinessKey }) => types.includes(sourceEntityType)
            && !(message.via?.definition === view.definition && message.via.businessKey === sourceEntityBusinessKey))
        .map(({ sourceEntityType, sourceEntityBusinessKey }) => ({
            message: { kind: 'check', entityType: sourceEntityType, businessKey: sourceEntityBusinessKey, role: view.role, revision: message.revision },
            group: `${sourceEntityType}/${sourceEntityBusinessKey}`
        }));
};
