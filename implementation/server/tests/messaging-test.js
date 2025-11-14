import { loadDefinitions } from 'system/definitions-loader.js';
import { registerObject } from 'system/objects-registry.js';
import { execute } from 'system/class.js'; 
import path from 'path';

async function main() {
    const paths = [ 'implementation/server/packages/messaging' ]
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));

    const bus = {
        id: 'direct-bus',
        type: 'instance',
        class: 'in-process-event-bus',
        configuration: {
            namespace: 'sys'
        }
    };

    registerObject(bus);

    const channel = {
        id: 'test-message-channel',
        type: 'instance',
        class: 'message-channel',
        configuration: {
            channelName: 'test',
            messageBus: 'direct-bus',
            topology: 'queue'
        }
    };

    registerObject(channel);

    await execute('test-message-channel', 'registerConsumer', { consumerName: 'test-consumer', handler: ({ message }) => { console.log(`I have received a message: "${message}"`); } });

    await execute('test-message-channel', 'publish', { message: 'hello!' });
}

main();
