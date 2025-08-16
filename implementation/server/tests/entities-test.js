const { loadDefinitions } = require('system/definitions-loader')
const { execute } = require('system/type'); 
const path = require('path');

async function main() {
    // const paths = [ 'implementation/server/packages' ]
    const paths = [ 'packages' ]
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));
    const response = await execute('entity-database', 'mongodb', {
        method: 'create',
        collection: 'entities',
        data: {
            test: 'test'
        }
    });
    console.log(response);
}

main();
