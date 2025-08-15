const Ajv = require('ajv');
const ajv = new Ajv();

function registerSchema(schema) {
    ajv.addSchema(schema);
}

function isValidAgainstSchema(schema, object) {
    const validate = ajv.compile(schema);
    return validate(object);
}

module.exports = {
    registerSchema,
    isValidAgainstSchema
}