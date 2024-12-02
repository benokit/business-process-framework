const { getDefinition } = require('elements-definitions-provider');
const { getModule } = require('elements-modules-provider');

async function createElement ({ elementType, elementName, constructorName, constructorInputData, context: { transaction } }) {
    
    var elementDefinition = await getDefinition({ elementType, elementName });

    if (!transaction.isActive) {
        transaction.new();
    }

    const elementConstructionData = constructorName ? 
        evaluateFunction({ functionDefinition: elementDefinition.constructors[constructorName], inputData: constructorInputData })
        : constructorInputData;

    const elementId = transaction.data.create({
        elementType,
        elementName,
        elementData: elementConstructionData.elementData });

    for (const traitName in elementDefinition.traits) {
        await createTrait({ 
            entityId: elementId,
            traitName,
            traitDefinition: elementDefinition.traits[traitName],
            traitConstructorData: elementData.traits[traitName].data,
            traitConstructorName: elementData.traits[traitName].constructorName,
            context });
    }

    await transaction.commit();
};

function evaluateFunction({ functionDefinition: { inputDataSchema, outputDataSchema, implementation: { moduleName, functionName } }, inputData }) {
    
    validateSchema({ dataSchema: inputDataSchema, data: inputData});

    const module = getModule(moduleName);

    if (typeof module[functionName] === 'function') {
        const outputData = module[functionName](inputData);
        validateSchema({ dataSchema: outputDataSchema, data: outputData });
    } 
    else {
        throw new Error(`Function "${functionName}" not found in module ${moduleName}`);
    }
}

function validateSchema({ dataSchema, data }){

}



