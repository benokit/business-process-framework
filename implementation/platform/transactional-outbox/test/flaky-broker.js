import { CoreError } from '@business-framework/core';

export const delivered = [];
export const failures = { remaining: 0 };
export const refusals = { remaining: 0 };
export const outage = { on: false };

export const publish = ({ input: { envelope } }) => {
    if (outage.on) throw new CoreError('unavailable', 'broker unavailable', {});
    if (refusals.remaining > 0) {
        refusals.remaining -= 1;
        throw new CoreError('conflict', 'message refused', {});
    }
    if (failures.remaining > 0) {
        failures.remaining -= 1;
        throw new CoreError('flaky', 'message rejected', {});
    }
    delivered.push({ ...envelope.message, messageId: envelope.messageId });
    return { messageId: envelope.messageId };
};

export const subscribe = () => null;

export const unsubscribe = () => null;
