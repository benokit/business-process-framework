import { randomUUID } from 'crypto';

export const createEnvelope = ({ input: { message, group, messageId = randomUUID(), timestampUTC = new Date().toISOString(), correlation = randomUUID() } }) => ({
    messageId,
    timestampUTC,
    group: group ?? messageId,
    correlation,
    message
});
