const { loadDefinitions } = require('system/definitions-loader')
const { execute } = require('system/class'); 
const path = require('path');

async function main() {
    // const paths = [ 'implementation/server/packages' ]
    const paths = [ 'packages' ]
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));
    const { id } = await execute('entity-database', 'mongodb', {
        method: 'create',
        collection: 'entities',
        data: {
            test: 'test'
        }
    });
    const getResponse = await execute('entity-database', 'mongodb', {
        method: 'read',
        collection: 'entities',
        id: id
    });
    console.log(getResponse);
    const updateResponse = await execute('entity-database', 'mongodb', {
        method: 'update',
        collection: 'entities',
        id: id,
        data: {
            test: 'test-2',
            something: 'else'
        }
    });
    console.log(updateResponse);
    const deleteResponse = await execute('entity-database', 'mongodb', {
        method: 'delete',
        collection: 'entities',
        id: id
    });
    console.log(deleteResponse);
    await execute('entity-database', 'mongodb', {
        method: 'read',
        collection: 'entities',
        id: id
    });
}

main();
