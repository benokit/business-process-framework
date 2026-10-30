import { CoreError } from '@business-framework/core';

export const delivered = [];
export const failures = { remaining: 0 };
export const outage = { on: false };

export const publish = ({ input: { envelope } }) => {
    if (outage.on) throw new CoreError('unavailable', 'broker unavailable', {});
    if (failures.remaining > 0) {
        failures.remaining -= 1;
        throw new Error('message rejected');
    }
    delivered.push({ ...envelope.message, messageId: envelope.messageId });
    return { messageId: envelope.messageId };
};

export const subscribe = () => null;

export const unsubscribe = () => null;
