import { randomUUID } from 'crypto';

export const createEnvelope = ({ input: { message, group, subject, messageId = randomUUID(), timestampUTC = new Date().toISOString(), correlation = randomUUID() } }) => ({
    messageId,
    timestampUTC,
    group: group ?? messageId,
    ...(subject && { subject }),
    correlation,
    message
});
