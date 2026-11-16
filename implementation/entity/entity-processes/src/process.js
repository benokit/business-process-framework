import { CoreError, invoke } from '@business-framework/core';
import { selvesOf } from '@business-framework/core/kinds';
import { applyMapping } from '@business-framework/core/mappings';

const definitionOf = id => selvesOf('process-definition').find(element => element.id === id).data;

const unbound = (roles, entities) => Object.entries(roles).filter(([role, { late }]) => !late && entities[role] === undefined).map(([role]) => role);

const lateBound = (roles, entities) => Object.entries(roles).filter(([role, { late }]) => late && entities[role] !== undefined).map(([role]) => role);

const unknown = (roles, entities) => Object.keys(entities).filter(role => roles[role] === undefined);

const bindingOf = ({ entityType, many }) => businessKeys => many
    ? [businessKeys].flat().map(businessKey => ({ entityType, businessKey }))
    : { entityType, businessKey: businessKeys };

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

const withVariables = (scope, variables) => ({ ...scope, process: { ...scope.process, data: { ...scope.process.data, body: variables } } });

export const processExit = ({ name, step, scope, revision }) => {
    const variables = { ...scope.process.data.body, ...step.set === undefined ? {} : evaluated(step.set, scope) };
    return { variables, ...exitOf(name, step, withVariables(scope, variables), revision) };
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

const stepsOf = ({ definition }) => definitionOf(definition).steps;

const signalTarget = (process, { name, payload }) => process.data.process.wait?.signals.includes(name)
    ? { step: stepsOf(process.data.process)[process.data.process.step].wait.signals[name].to, signal: payload ?? null }
    : null;

const timerTarget = (process, { token, step }) => process.data.process.wait?.token === token && process.data.process.wait.until?.then === step
    ? { step, signal: null }
    : null;

export const wakeupTarget = ({ process, wakeup }) => process.data.state.status !== 'running'
    ? null
    : wakeup.kind === 'signal' ? signalTarget(process, wakeup) : timerTarget(process, wakeup);
