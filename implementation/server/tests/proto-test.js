const { loadDefinitions } = require('system/definitionsLoader')
const { getDefinition } = require('system/register');
const { evaluate } = require('system/type'); 

async function main() {
    await loadDefinitions([ '/Users/benjaminbatistic/Programming/business-process-framework/implementation/server/packages/playground' ]);
    const sumArray = getDefinition('function', 'sumArray');
    console.log(evaluate(sumArray, [1,2,3,4]));
}

main();
