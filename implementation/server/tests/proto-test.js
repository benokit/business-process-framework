const { loadDefinitions } = require('system/definitionsLoader')
const { evaluate } = require('system/type'); 
const path = require('path');

async function main() {
    const paths = [ 'packages' ]
    await loadDefinitions(paths.map(p => path.join(process.cwd(), p)));
    console.log(evaluate('function', 'sumArray', [1,2,3,4,5]));
}

main();
