const Ajv = require('ajv');
const ajv = new Ajv();

ajv.addKeyword({
  keyword: "response",
  schemaType: ["object"],
  validate: () => true
});

function registerSchema(schema) {
    ajv.addSchema(schema);
}

function validateSchema(schema, object) {
    const validate = ajv.compile(schema);
    const validationResult = validate(object);
    return {
        isValid: validationResult,
        errors: validate.errors
    }
}

module.exports = {
    registerSchema,
    validateSchema
}