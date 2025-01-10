async function evaluateWithConfiguration(instanceName, input, instanceConfiguration) {
    const definition = await getDefinition(instanceName);
    const { type: baseTypeName, parameters: configurationSchema, evaluate: evaluationImplementation } = definition;

    await validateSchema(configurationSchema, instanceConfiguration);
    
    if (definition.evaluationImplementation) {
        const f = getEvaluationImplementation(evaluationImplementation);
        return f({ input, context: { configuration: instanceConfiguration }});
    }
    
    const baseTypeConfiguration = applyInstanceConfiguration(instanceConfiguration, definition.configuration);

    return evaluate(baseTypeName, input, baseTypeConfiguration);
}
