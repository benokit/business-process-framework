const { evaluate, getObject, registerObject, registerTypeDefinition, isValidAgainstSchema, isFunction, isAsyncFunction } = require('../src/system');

const functionTypeDefinition = {
    type: 'type',
    id: 'function',
    configurationSchema: {
        $ref: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
            inputSchema: {
                type: 'object'
            },
            outputSchema: {
                type: 'object'
            },
            implementation: {
                type: 'string'
            } 
        }
    },
    evaluate: {
        inputSchema: {},
        implementation: 'evaluateFunction'
    }
};

function evaluateFunction(functionInstance, input) {
    if(!isValidAgainstSchema(functionInstance.configuration.inputSchema, input)) {
        throw 'not valid input schema';
    }

    const fn = getObject(functionInstance.configuration.implementation);

    if (!fn) {
        throw 'missing implementation';
    }

    if (!isFunction(fn)) {
        throw 'evaluation is not a function';
    }

    if (isAsyncFunction(fn)) {
        throw 'evaluation can not be asynchronous';
    }

    return fn(input);
}

const sumFunction = {
    type: 'function',
    id: 'sumFunction',
    configuration: {
        inputSchema: {
            $ref: 'http://json-schema.org/draft-07/schema#',
            type: 'array',
            items: {
                type: "number"
            }
        },
        outputSchema: {
            $ref: 'http://json-schema.org/draft-07/schema#',
            type: 'number'
        },
        implementation: 'sumFunctionImplementation' 
    }
}

function sumFunctionImplementation(numbers) {
    return numbers.reduce((acc, number) => acc + number, 0);
}

registerObject('sumFunctionImplementation', sumFunctionImplementation);
registerObject('evaluateFunction', evaluateFunction);

registerTypeDefinition(functionTypeDefinition);

console.log(evaluate(sumFunction, [1,2,3,4]));

