import { expect } from 'chai';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadElements } from '@business-framework/core/elements-loader';
import { executeService } from '@business-framework/core/execution';
import { registerElement } from '@business-framework/core/elements-registry';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELEMENTS_DIR      = join(__dirname, '../elements');
const CORE_ELEMENTS_DIR = join(__dirname, '../../core/elements');

describe('entity-catalog service', function () {

    before(async () => {
        await loadElements([ELEMENTS_DIR, CORE_ELEMENTS_DIR]);

        // Schema element referenced by @product-data in the product entity type below.
        registerElement({
            kind: 'schema',
            id: 'product-data',
            data: { '!name': 'string', 'price': 'number' }
        });

        // Entity type whose dataSchema is a @reference — tests schema resolution.
        registerElement({
            kind: 'entity-type',
            id: 'product',
            data: {
                dataSchema: '@product-data',
                statesModel: {
                    states: { status: ['active', 'discontinued'] },
                    transitions: {
                        discontinue: { from: { status: ['active'] }, to: { status: 'discontinued' } }
                    }
                }
            }
        });

        // Entity type with an inline dataSchema — must pass through unchanged.
        registerElement({
            kind: 'entity-type',
            id: 'invoice',
            data: {
                dataSchema: { '!amount': 'number', '!currency': 'string' }
            }
        });

        // Entity type with no statesModel — verifies optional field handling.
        registerElement({
            kind: 'entity-type',
            id: 'tag',
            data: {
                dataSchema: { '!label': 'string' }
            }
        });

        // Service extension for testing listServiceExtensions.
        registerElement({
            kind: 'service/entity-service-extension/user',
            id: 'user-password-service',
            data: {
                interface: {
                    'set-password': {
                        input: { '!password': 'string' },
                        output: '@entity-record'
                    }
                }
            }
        });

        // Mock entity-database — list captures its input on _ctx so tests can assert on it.
        registerElement({
            kind: 'service',
            id: 'entity-database',
            data: {
                interface: {
                    create: { input: {}, output: {} },
                    read:   { input: {}, output: {} },
                    update: { input: {}, output: {} },
                    amend:  { input: {}, output: {} },
                    delete: { input: {}, output: {} },
                    list:   { input: {}, output: {} }
                },
                implementation: {
                    create: { return: '#.input' },
                    read:   { return: '#.input' },
                    update: { return: '#.input' },
                    amend:  { return: '#.input' },
                    delete: { return: '#.input' },
                    list: [
                        { outputKey: '_ctx', set: { listCalledWith: '#.input' } },
                        { return: { items: [], total: 0 } }
                    ]
                }
            }
        });
    });

    // -------------------------------------------------------------------------
    describe('listTypes', () => {

        it('returns an items array', async () => {
            const result = await executeService('entity-catalog', 'listTypes', {});
            expect(result.items).to.be.an('array');
        });

        it('includes all registered entity types', async () => {
            const result = await executeService('entity-catalog', 'listTypes', {});
            const ids = result.items.map(item => item.id);
            expect(ids).to.include('product');
            expect(ids).to.include('invoice');
            expect(ids).to.include('tag');
        });

        it('resolves @schema reference to schema element data', async () => {
            const result = await executeService('entity-catalog', 'listTypes', {});
            const product = result.items.find(item => item.id === 'product');
            expect(product).to.exist;
            expect(product.dataSchema).to.deep.equal({ $id: 'product-data', $data: { '!name': 'string', 'price': 'number' } });
        });

        it('passes inline dataSchema through unchanged', async () => {
            const result = await executeService('entity-catalog', 'listTypes', {});
            const invoice = result.items.find(item => item.id === 'invoice');
            expect(invoice).to.exist;
            expect(invoice.dataSchema).to.deep.equal({ '!amount': 'number', '!currency': 'string' });
        });

        it('includes statesModel when present on the entity type', async () => {
            const result = await executeService('entity-catalog', 'listTypes', {});
            const product = result.items.find(item => item.id === 'product');
            expect(product.statesModel).to.deep.equal({
                states: { status: ['active', 'discontinued'] },
                transitions: {
                    discontinue: { from: { status: ['active'] }, to: { status: 'discontinued' } }
                }
            });
        });

        it('statesModel is undefined when not defined on the entity type', async () => {
            const result = await executeService('entity-catalog', 'listTypes', {});
            const tag = result.items.find(item => item.id === 'tag');
            expect(tag).to.exist;
            expect(tag.statesModel).to.be.undefined;
        });

        it('each item carries the entity type id', async () => {
            const result = await executeService('entity-catalog', 'listTypes', {});
            for (const item of result.items) {
                expect(item.id).to.be.a('string');
            }
        });

    });

    // -------------------------------------------------------------------------
    describe('listEntities', () => {

        it('passes entityType to entity-database.list', async () => {
            const _ctx = {};
            await executeService('entity-catalog', 'listEntities', { entityType: 'order' }, _ctx);
            expect(_ctx.listCalledWith.entityType).to.equal('order');
        });

        it('passes limit to entity-database.list', async () => {
            const _ctx = {};
            await executeService('entity-catalog', 'listEntities', { entityType: 'order', limit: 10 }, _ctx);
            expect(_ctx.listCalledWith.limit).to.equal(10);
        });

        it('passes offset to entity-database.list', async () => {
            const _ctx = {};
            await executeService('entity-catalog', 'listEntities', { entityType: 'order', offset: 20 }, _ctx);
            expect(_ctx.listCalledWith.offset).to.equal(20);
        });

        it('returns the items and total from entity-database', async () => {
            const result = await executeService('entity-catalog', 'listEntities', { entityType: 'order' });
            expect(result).to.deep.equal({ items: [], total: 0 });
        });

        it('throws when entityType is missing', async () => {
            let error;
            try { await executeService('entity-catalog', 'listEntities', {}); }
            catch (e) { error = e; }
            expect(error).to.exist;
            expect(error.cause).to.be.a('string').that.includes('input is not valid');
        });

    });

    // -------------------------------------------------------------------------
    describe('listServiceExtensions', () => {

        it('returns entityType in result', async () => {
            const result = await executeService('entity-catalog', 'listServiceExtensions', { entityType: 'user' });
            expect(result.entityType).to.equal('user');
        });

        it('returns services array', async () => {
            const result = await executeService('entity-catalog', 'listServiceExtensions', { entityType: 'user' });
            expect(result.services).to.be.an('array');
        });

        it('returns extensions for the given entity type', async () => {
            const result = await executeService('entity-catalog', 'listServiceExtensions', { entityType: 'user' });
            expect(result.services).to.have.length(1);
            expect(result.services[0].id).to.equal('user-password-service');
        });

        it('returns interface from the extension', async () => {
            const result = await executeService('entity-catalog', 'listServiceExtensions', { entityType: 'user' });
            expect(result.services[0].interface).to.deep.equal({
                'set-password': {
                    input: { '!password': 'string' },
                    output: '@entity-record'
                }
            });
        });

        it('returns empty services when no extensions exist', async () => {
            const result = await executeService('entity-catalog', 'listServiceExtensions', { entityType: 'nonexistent' });
            expect(result.services).to.deep.equal([]);
        });

    });

});

// =============================================================================
describe('entity-catalog-controller', function () {

    describe('listTypes', () => {

        it('returns status 200', async () => {
            const { status } = await executeService('entity-catalog-controller', 'listTypes', {});
            expect(status).to.equal(200);
        });

        it('returns items array in body', async () => {
            const { body } = await executeService('entity-catalog-controller', 'listTypes', {});
            expect(body.items).to.be.an('array');
        });

    });

    describe('listEntities', () => {

        it('returns status 200', async () => {
            const { status } = await executeService('entity-catalog-controller', 'listEntities', {
                params: { entityType: 'order' },
                query: {}
            });
            expect(status).to.equal(200);
        });

        it('returns body from entity-database', async () => {
            const { body } = await executeService('entity-catalog-controller', 'listEntities', {
                params: { entityType: 'order' },
                query: {}
            });
            expect(body).to.deep.equal({ items: [], total: 0 });
        });

        it('maps entityType from params', async () => {
            const _ctx = {};
            await executeService('entity-catalog-controller', 'listEntities', {
                params: { entityType: 'product' },
                query: {}
            }, _ctx);
            expect(_ctx.listCalledWith.entityType).to.equal('product');
        });

        it('maps limit and offset from query', async () => {
            const _ctx = {};
            await executeService('entity-catalog-controller', 'listEntities', {
                params: { entityType: 'order' },
                query: { limit: 5, offset: 10 }
            }, _ctx);
            expect(_ctx.listCalledWith.limit).to.equal(5);
            expect(_ctx.listCalledWith.offset).to.equal(10);
        });

    });

});
