import { loadDefinitions } from 'system/definitions-loader.js';
import { execute } from 'system/class.js'; 
import path from 'path';

async function main() {
    const paths = [ 'implementation/server/packages/sequences' ]
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));

    console.log(await execute({ class: 'mongo-sequence', configuration: { sequenceName: 'test' }}, 'next'));
}

main();
