export const delivered = [];
export const failures = { remaining: 0 };

export const publish = ({ input: { envelope } }) => {
    if (failures.remaining > 0) {
        failures.remaining -= 1;
        throw new Error('broker unavailable');
    }
    delivered.push(envelope.message);
    return { messageId: envelope.messageId };
};

export const subscribe = () => null;

export const unsubscribe = () => null;
