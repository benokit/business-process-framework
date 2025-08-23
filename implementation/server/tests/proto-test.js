const { loadDefinitions } = require('system/definitions-loader')
const { evaluate } = require('system/class'); 
const path = require('path');

async function main() {
    const paths = [ 'packages' ]
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));
    console.log(evaluate('function', 'sum-array', [1,2,3,4,5]));
}

main();
