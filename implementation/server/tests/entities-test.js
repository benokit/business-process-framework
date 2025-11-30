import { loadDefinitions } from 'core/definitions'
import { execute } from 'core/service'; 
import path from 'path';
import { map } from 'lodash-es';

async function main() {
    const paths = map(
    [ 
        'packages/core',
        'packages/base',
        'packages/entities'
    ], p => p ); // 'implementation/server/' + p);
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));

    const { id } = await execute({ service: 'mongodb' }, 'create', {
        collection: 'entities',
        data: {
            test: 'test'
        }
    });
    const getResponse = await execute({ service: 'mongodb' }, 'read', {
        collection: 'entities',
        id: id
    });
    console.log(getResponse);
    const updateResponse = await execute({ service: 'mongodb' }, 'update', {
        collection: 'entities',
        id: id,
        data: {
            test: 'test-2',
            something: 'else'
        }
    });
    console.log(updateResponse);
    const deleteResponse = await execute({ service: 'mongodb' }, 'delete', {
        collection: 'entities',
        id: id
    });
    console.log(deleteResponse);
    console.log(await execute({ service: 'mongodb' }, 'read', {
        collection: 'entities',
        id: id
    }));
}

main();
