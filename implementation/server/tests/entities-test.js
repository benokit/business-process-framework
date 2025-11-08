import { loadDefinitions } from 'system/definitions-loader.js'
import { execute } from 'system/class.js'; 
import path from 'path';

async function main() {
    const paths = [ 'implementation/server/packages/entities' ]
    // const paths = [ 'packages/entities' ]
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));
    const { id } = await execute({ class: 'mongodb' }, 'create', {
        collection: 'entities',
        data: {
            test: 'test'
        }
    });
    const getResponse = await execute({ class: 'mongodb' }, 'read', {
        collection: 'entities',
        id: id
    });
    console.log(getResponse);
    const updateResponse = await execute({ class: 'mongodb' }, 'update', {
        collection: 'entities',
        id: id,
        data: {
            test: 'test-2',
            something: 'else'
        }
    });
    console.log(updateResponse);
    const deleteResponse = await execute({ class: 'mongodb' }, 'delete', {
        collection: 'entities',
        id: id
    });
    console.log(deleteResponse);
    console.log(await execute({ class: 'mongodb' }, 'read', {
        collection: 'entities',
        id: id
    }));
}

main();
