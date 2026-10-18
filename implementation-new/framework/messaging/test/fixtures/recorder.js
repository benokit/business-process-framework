export const received = [];

export const record = ({ input, _ctx }) => {
    received.push({ input, _ctx });
    return null;
};
