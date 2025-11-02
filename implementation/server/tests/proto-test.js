import { loadDefinitions } from 'system/definitions-loader.js';
import { execute } from 'system/class.js'; 
import path from 'path';

async function main() {
    const paths = [ 'implementation/server/packages/playground' ]
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));
    console.log(await execute('sum-array', 'evaluate', [1,2,3,4,5]));
}

main();
