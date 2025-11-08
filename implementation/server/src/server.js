import { loadDefinitions } from 'system/definitions-loader.js';
import { execute } from 'system/class.js'; 
import path from 'path';

async function main() {
    // const paths = [ 'implementation/server/packages' ]
    const paths = [ 'packages' ];
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));

    await execute(
        {
            class: 'http-service',
            configuration: {
                port: 3000
            }
        }, 'startService');
}

main();