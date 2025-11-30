import { loadDefinitions } from 'core/definitions';
import { execute } from 'core/service'; 
import path from 'path';
import { map } from 'lodash-es';

async function main() {
    const paths = 
    map(
    [ 
        'packages/core',
        'packages/base',
        'packages/playground'
    ], p => p ); // 'implementation/server/' + p);
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));
    console.log(await execute('sum-array', 'evaluate', [1,2,3,4,5]));
}

main();
