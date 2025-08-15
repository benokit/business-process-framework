const Ajv = require('ajv');

const ajv = new Ajv();

ajv.addSchema({
    $id: 'schema',
    $ref: 'http://json-schema.org/draft-07/schema#'
});

ajv.addSchema({
    $schema: 'schema',
    $id: 'schema-container',
    type: 'object',
    properties: {
        schema: {
            $ref: 'schema'
        }
    }
});

const something = {
    schema: {
        definition: 'schema',
        type: 'string',
        additionalProperties: true
    }
};

const validate = ajv.getSchema('schema-container');

const isValid = validate(something);
console.log(isValid);
console.log(validate.errors);