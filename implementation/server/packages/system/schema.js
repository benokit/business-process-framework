import { compactToStandard } from '@benokit/js-cjsl';
import Ajv from 'ajv';
const ajv = new Ajv();

function registerSchema(schema) {
    ajv.addSchema(schema);
}

function validateSchema(schema, object) {
    const validate = ajv.compile(compactToStandard(schema));
    const validationResult = validate(object);
    return {
        isValid: validationResult,
        errors: validate.errors
    }
}

export {
    registerSchema,
    validateSchema
}