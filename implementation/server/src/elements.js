const lodash = require('lodash');

function evaluate(evaluatableId, input) {
    const { configuration, evaluateFunction } = resolveDefinition(evaluatableId);
    return evaluateFunction(configuration, input); 
}

async function execute(executableId, input) {
    const { configuration, executeFunction } = resolveDefinition(executableId);
    return await executeFunction(configuration, input); 
}

function resolveDefinition(definitionId) {
    const definition = getDefinition(definitionId);
    const { type, configuration } = definition;
    if (configuration) {
        const base = resolveDefinition(type);
        return {
            ...base,
            configuration: mergeConfiguration(configuration, baseConfiguration)
        }
    }
    const { evaluate, execute } = definition;
    return {
        configuration,
        evaluateFunction: getFunction(evaluate),
        executeFunction: getFunction(execute)
    };
}

function mergeConfiguration(configuration, baseConfiguration) {
    return lodash.merge({}, baseConfiguration, configuration);
}
