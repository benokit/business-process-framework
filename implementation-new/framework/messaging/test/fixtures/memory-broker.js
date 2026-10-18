import { invoke } from '@business-framework/core';

export const published = [];
const subscriptions = new Map();

export const reset = () => {
    published.length = 0;
    subscriptions.clear();
};

export const publish = ({ input: { channel, envelope } }) => {
    published.push({ channel: channel.id, envelope });
    return { messageId: envelope.messageId };
};

export const subscribe = ({ input: { channel, consumer } }) => {
    subscriptions.set(consumer, channel.id);
    return null;
};

export const unsubscribe = ({ input: { consumer } }) => {
    subscriptions.delete(consumer);
    return null;
};

export const deliverAll = async () => {
    const pending = published.splice(0);
    await Promise.all(pending.flatMap(({ channel, envelope }) => [...subscriptions]
        .filter(([, subscribed]) => subscribed === channel)
        .map(([consumer]) => invoke(consumer, 'handle', envelope))));
};
