import { isString } from "lodash-es";
import { execute } from "system/class.js";

export {
    publish,
    registerConsumer
}

async function publish(configuration, message) {
    await execute(configuration.messageBus, 'publish', { channelName: configuration.channelName, message });
}

async function registerConsumer(configuration, { consumerName, handler }) {
    const fn = isString(handler) ? await import(handler) : handler;
    await execute(configuration.messageBus, 'registerConsumer', { channelName: configuration.channelName, consumerName, handler: fn });
}
