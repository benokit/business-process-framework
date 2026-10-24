import { execute } from '@business-framework/core';

const afterCommitActions = new Map();

const take = sessionId => {
    const actions = afterCommitActions.get(sessionId) ?? [];
    afterCommitActions.delete(sessionId);
    return actions;
};

const withoutTransaction = _ctx => Object.freeze(Object.fromEntries(Object.entries(_ctx).filter(([key]) => key !== 'transaction')));

const run = action => execute(action).catch(() => null);

export const runAfterCommit = async ({ input: { sessionId } }) => {
    for (const action of take(sessionId)) await run(action);
    return null;
};

export const dropAfterCommit = ({ input: { sessionId } }) => {
    take(sessionId);
    return null;
};

export const afterCommit = async ({ input: { method, input, self }, _ctx }) => {
    const action = { method, input, self, _ctx: withoutTransaction(_ctx) };
    if (!_ctx.transaction) {
        await run(action);
        return null;
    }
    const { sessionId } = _ctx.transaction;
    afterCommitActions.set(sessionId, [...afterCommitActions.get(sessionId) ?? [], action]);
    return null;
};
