import { expect } from 'chai';
import { registerSchema, validateSchema } from 'core/schema';

describe('schema tests', () => {

    describe('validateSchema', () => {

        describe('return value structure', () => {
            it('should return isValid true and errors null for valid data', () => {
                const result = validateSchema('string', 'hello');
                expect(result).to.deep.equal({ isValid: true, errors: null });
            });

            it('should return isValid false and errors array for invalid data', () => {
                const result = validateSchema({ '!x': 'string' }, {});
                expect(result.isValid).to.be.false;
                expect(result.errors).to.be.an('array').with.length.greaterThan(0);
            });
        });

        describe('primitive types', () => {
            it('should validate a string', () => {
                expect(validateSchema('string', 'hello').isValid).to.be.true;
            });

            it('should reject a non-string against string schema', () => {
                expect(validateSchema('string', 42).isValid).to.be.false;
            });

            it('should validate a number', () => {
                expect(validateSchema('number', 3.14).isValid).to.be.true;
            });

            it('should reject a string against number schema', () => {
                expect(validateSchema('number', 'not-a-number').isValid).to.be.false;
            });

            it('should validate a boolean', () => {
                expect(validateSchema('boolean', false).isValid).to.be.true;
            });

            it('should reject a number against boolean schema', () => {
                expect(validateSchema('boolean', 0).isValid).to.be.false;
            });

            it('should validate null', () => {
                expect(validateSchema('null', null).isValid).to.be.true;
            });

            it('should reject a non-null against null schema', () => {
                expect(validateSchema('null', 'not-null').isValid).to.be.false;
            });

            it('should validate an object against object schema', () => {
                expect(validateSchema('object', { any: 'value' }).isValid).to.be.true;
            });
        });

        describe('required properties (! prefix)', () => {
            it('should pass when required property is present', () => {
                expect(validateSchema({ '!name': 'string' }, { name: 'Alice' }).isValid).to.be.true;
            });

            it('should fail when required property is missing', () => {
                expect(validateSchema({ '!name': 'string' }, {}).isValid).to.be.false;
            });

            it('should pass when optional property is absent', () => {
                expect(validateSchema({ name: 'string' }, {}).isValid).to.be.true;
            });

            it('should fail when required property has wrong type', () => {
                expect(validateSchema({ '!age': 'number' }, { age: 'not-a-number' }).isValid).to.be.false;
            });

            it('should fail when any required property is missing from a multi-field schema', () => {
                const schema = { '!id': 'string', '!age': 'number' };
                expect(validateSchema(schema, { id: 'abc', age: 25 }).isValid).to.be.true;
                expect(validateSchema(schema, { id: 'abc' }).isValid).to.be.false;
            });
        });

        describe('array property ([] postfix)', () => {
            it('should validate array of strings', () => {
                expect(validateSchema({ 'tags[]': 'string' }, { tags: ['a', 'b'] }).isValid).to.be.true;
            });

            it('should reject array with wrong item types', () => {
                expect(validateSchema({ 'tags[]': 'string' }, { tags: [1, 2] }).isValid).to.be.false;
            });

            it('should validate an empty array', () => {
                expect(validateSchema({ 'items[]': 'number' }, { items: [] }).isValid).to.be.true;
            });

            it('should reject a non-array value', () => {
                expect(validateSchema({ 'items[]': 'number' }, { items: 'not-an-array' }).isValid).to.be.false;
            });
        });

        describe('object with additionalProperties ({} postfix)', () => {
            it('should validate object whose values match the specified type', () => {
                expect(validateSchema({ 'scores{}': 'number' }, { scores: { alice: 10, bob: 20 } }).isValid).to.be.true;
            });

            it('should reject object whose values do not match the specified type', () => {
                expect(validateSchema({ 'scores{}': 'number' }, { scores: { alice: 'ten' } }).isValid).to.be.false;
            });
        });

        describe('tuple property (() postfix)', () => {
            it('should validate a matching tuple', () => {
                expect(validateSchema({ 'pair()': ['string', 'number'] }, { pair: ['hello', 42] }).isValid).to.be.true;
            });

            it('should reject a tuple with items in the wrong order', () => {
                expect(validateSchema({ 'pair()': ['string', 'number'] }, { pair: [42, 'hello'] }).isValid).to.be.false;
            });
        });

        describe('const property (= postfix)', () => {
            it('should validate a matching const value', () => {
                expect(validateSchema({ 'kind=': 'dog' }, { kind: 'dog' }).isValid).to.be.true;
            });

            it('should reject a non-matching value', () => {
                expect(validateSchema({ 'kind=': 'dog' }, { kind: 'cat' }).isValid).to.be.false;
            });
        });

        describe('enum property (=1 postfix)', () => {
            it('should validate a value within the enum', () => {
                expect(validateSchema({ 'status=1': ['active', 'inactive'] }, { status: 'active' }).isValid).to.be.true;
            });

            it('should reject a value outside the enum', () => {
                expect(validateSchema({ 'status=1': ['active', 'inactive'] }, { status: 'pending' }).isValid).to.be.false;
            });
        });

        describe('anyOf property (# postfix)', () => {
            it('should validate when value matches one of the schemas', () => {
                expect(validateSchema({ 'value#': ['string', 'number'] }, { value: 'hello' }).isValid).to.be.true;
                expect(validateSchema({ 'value#': ['string', 'number'] }, { value: 42 }).isValid).to.be.true;
            });

            it('should reject when value matches none of the schemas', () => {
                expect(validateSchema({ 'value#': ['string', 'number'] }, { value: true }).isValid).to.be.false;
            });
        });

        describe('oneOf property (#1 postfix)', () => {
            it('should validate when value matches exactly one schema', () => {
                expect(validateSchema({ 'value#1': ['string', 'number'] }, { value: 'hello' }).isValid).to.be.true;
            });

            it('should reject when value matches none of the schemas', () => {
                expect(validateSchema({ 'value#1': ['string', 'number'] }, { value: true }).isValid).to.be.false;
            });
        });

        describe('allOf property (#& postfix)', () => {
            it('should validate when value satisfies all schemas', () => {
                const schema = { 'profile#&': [{ '!name': 'string' }, { '!age': 'number' }] };
                expect(validateSchema(schema, { profile: { name: 'Alice', age: 30 } }).isValid).to.be.true;
            });

            it('should reject when value fails any of the schemas', () => {
                const schema = { 'profile#&': [{ '!name': 'string' }, { '!age': 'number' }] };
                expect(validateSchema(schema, { profile: { name: 'Alice' } }).isValid).to.be.false;
            });
        });

        describe('string with pattern (type:pattern syntax)', () => {
            it('should validate a string matching the pattern', () => {
                expect(validateSchema({ code: 'string:^[A-Z]+$' }, { code: 'ABC' }).isValid).to.be.true;
            });

            it('should reject a string that does not match the pattern', () => {
                expect(validateSchema({ code: 'string:^[A-Z]+$' }, { code: 'abc' }).isValid).to.be.false;
            });
        });

        describe('top-level $data', () => {
            it('should validate a top-level primitive type', () => {
                expect(validateSchema({ $data: 'string' }, 'hello').isValid).to.be.true;
            });

            it('should reject a wrong top-level type', () => {
                expect(validateSchema({ $data: 'string' }, 42).isValid).to.be.false;
            });

            it('should validate top-level oneOf via $data#1', () => {
                const schema = { '$data#1': ['string', 'number'] };
                expect(validateSchema(schema, 'hello').isValid).to.be.true;
                expect(validateSchema(schema, 42).isValid).to.be.true;
                expect(validateSchema(schema, true).isValid).to.be.false;
            });
        });

        describe('array shorthand (top-level oneOf)', () => {
            it('should validate when value matches one of the array schemas', () => {
                expect(validateSchema(['string', 'number'], 'hello').isValid).to.be.true;
                expect(validateSchema(['string', 'number'], 42).isValid).to.be.true;
            });

            it('should reject when value matches none of the array schemas', () => {
                expect(validateSchema(['string', 'number'], null).isValid).to.be.false;
            });
        });

        describe('nested objects', () => {
            it('should validate a complex nested schema', () => {
                const schema = {
                    '!user': {
                        '!name': 'string',
                        age: 'number',
                        'tags[]': 'string'
                    }
                };
                expect(validateSchema(schema, { user: { name: 'Bob', age: 25, tags: ['dev'] } }).isValid).to.be.true;
            });

            it('should reject when a nested required field is missing', () => {
                const schema = { '!user': { '!name': 'string' } };
                expect(validateSchema(schema, { user: {} }).isValid).to.be.false;
            });
        });
    });

    describe('registerSchema', () => {
        it('should allow referencing a registered schema via @id', () => {
            registerSchema({ $id: 'test-point', $data: { '!x': 'number', '!y': 'number' } });
            const result = validateSchema({ '!location': '@test-point' }, {
                location: { x: 10, y: 20 }
            });
            expect(result.isValid).to.be.true;
        });

        it('should reject data that fails a referenced registered schema', () => {
            const result = validateSchema({ '!location': '@test-point' }, {
                location: { x: 10 } // missing y
            });
            expect(result.isValid).to.be.false;
        });

        it('should allow referencing a registered primitive schema via @id', () => {
            registerSchema({ $id: 'test-label', $data: 'string' });
            expect(validateSchema({ title: '@test-label' }, { title: 'hello' }).isValid).to.be.true;
            expect(validateSchema({ title: '@test-label' }, { title: 42 }).isValid).to.be.false;
        });
    });
});
