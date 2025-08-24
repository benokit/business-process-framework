const { loadDefinitions } = require('system/definitions-loader')
const { executeInstance } = require('system/class'); 
const path = require('path');

async function main() {
    const paths = [ 'implementation/server/packages' ]
    // const paths = [ 'packages' ];
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));

    await executeInstance(
        {
            type: 'http-service',
            configuration: {
                port: 3000
            }
        },
        {
            method: 'start'
        }
    )
}

main();