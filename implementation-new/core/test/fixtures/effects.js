export const calls = [];

export const record = ({ input, _ctx }) => {
    calls.push({ input, _ctx });
    return input;
};

export const tryToMutateContext = ({ _ctx }) => {
    _ctx.user = 'intruder';
};

export const beginSession = () => ({ sessionId: calls.push({ begin: true }) });

export const endSession = ({ input }) => {
    calls.push({ end: input });
};
